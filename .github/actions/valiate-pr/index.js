const { context, getOctokit } = require('@actions/github');
const https = require('https');
const core = require('@actions/core');
const GITHUB_TOKEN = core.getInput('GITHUB_TOKEN');

const JIRA_API_PATH = '/rest/api/latest/issue/';
const JIRA_BASE_URL = core.getInput('JIRA_BASE_URL');
const JIRA_USER_EMAIL = core.getInput('JIRA_USER_EMAIL');
const JIRA_API_TOKEN = core.getInput('JIRA_API_TOKEN');
const TICKET_ID = core.getInput('TICKET_ID');

const { owner, repo } = context.issue;

let pull_request;
({ pull_request } = context.payload);
const PR_DESTINATION_BRANCH = pull_request.base.ref;

// Auth
const getAuthString = (user, pass) => (
  'Basic ' + new Buffer.from(`${user}:${pass}`).toString('base64')
);

// JIRA Options Base
const OPTIONS_BASE = {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': getAuthString(JIRA_USER_EMAIL, JIRA_API_TOKEN)
  },
};

const getJiraOptions = (ticketID) => ({
  ...OPTIONS_BASE,
  hostname: JIRA_BASE_URL,
  path: `${JIRA_API_PATH}${ticketID}`
});

// Tickets that exist in JIRA render with an anchor tag
// around the ticket ID
const ISSUE_EXISTS_REGEX = /(DP(BUG|DEV|DO|DX|EN|EPAM|MC|OPS|OSF|SM|SOW|SUPPORT)|EMEAX|EPP|RMS|BRC)-\d+/i;
// Tickets should be a feature level issue type
const ISSUE_TYPE_REGEX = /^(Sub-task|A360|Bug|DPBug|QA Bug|Story|\[System\] Incident|Task)$/i
// Tickets that explicitly say not to merge should
// be prevented from doing so.
const MERGE_CHECK_REGEX = /DO NOT MERGE/i;

// trims leading and trailing spaces for multi line text
const formatMultilineText = (text) =>
  text.replace(/\n\s+/g, '\n').replace(/\s+$/, '');

const throwValidationError = (err) => {
  core.setOutput('validation', false);
  throw new Error(formatMultilineText(err));
};

const requestData = (options, callback) => {

  const req = https.request(options, (res) => {
    const chunks = [];

    res.on('data', (chunk) => {
      chunks.push(chunk);
    });

    res.on('end', () => {
      const body = Buffer.concat(chunks);
      callback(JSON.parse(body.toString()));
    });

    res.on('error', (err) => {
      core.setOutput('validation', false);
      throw new Error(err);
    });

  });

  req.end();
};

const validatePR = ({
  id,
  key,
  fields
}) => {

  const title = pull_request.title;
  const branch_name = pull_request.head.ref;
  const ticketID = branch_name.match(ISSUE_EXISTS_REGEX)?.[0].toUpperCase();

  // Verify at a minimum the issue is referenced and exists within JIRA
  if (!ticketID) {
    throwValidationError(`The branch
      "${branch_name}"
      must include an existing JIRA ticket ID.
      Rename the branch to reference the relevant ticket.
    `);
  }

  // Does title contain ticket ID
  if (title.indexOf(ticketID) == -1) {

    throwValidationError(`The title message
      "${title}"
      must include an existing JIRA ticket ID.
      Rename the Pull Request title to reference the relevant ticket.
    `);
  }

  // Does title contain "DO NOT MERGE"
  if (MERGE_CHECK_REGEX.test(title)) {
    throwValidationError(`The title message
      "${title}"
      instructs this Pull Request should not be merged. Remove "DO NOT MERGE"
      text from title before proceeding.
    `);
  }

  requestData(getJiraOptions(ticketID), ({
    fields: {
      created,
      fixVersions,
      issuetype,
      status,
    },
  }) => {
    if (!ISSUE_TYPE_REGEX.test(issuetype?.name)) {
      throwValidationError(`The issue type for ${ticketID}
        is "${issuetype?.name}". The accepted issue types are:
        A360
        Bug
        DPBug
        Story
        [System] Incident
        Task
        Sub-task
      `);
    }

    // all release validation here
    if (PR_DESTINATION_BRANCH?.startsWith('release') || PR_DESTINATION_BRANCH?.startsWith('hotfix')) {
      // error if ticket isn't ready for deployment
      if (!/^Ready For Deployment$/i.test(status?.name)) {
        throwValidationError(`The ticket ${ticketID} has status "${status?.name}".
          Please move to "Ready For Deployment" and try again.
        `);
      }



      // Check ticket for valid Fix Version
      const validFixVersions = fixVersions.filter((fv) => {
        const prCreationDate = created.replace(/T.*/, ''); // 1970-01-01T00:00:00.000-0700 -> 1970-01-01
        // valid fix versions are after the PR create date
        // or are still flagged as unreleased
        return prCreationDate <= fv.releaseDate || !fv.released;
      });


      if (validFixVersions.length === 0) {
        throwValidationError(`The ticket ${ticketID} hasn't been assigned a valid fixVersion.
          Please assign under Release Checklist tab and try again. It could also be the case
          that the assigned fix versions do not have an assigned release date. Please check
          with DigiOps team to confirm.
        `);
      }
    }
  });

};

async function generateFreshContext() {
  try {
    const client = getOctokit(GITHUB_TOKEN);

    ({ data: pull_request} = await client.rest.pulls.get({
      owner,
      repo,
      pull_number: pull_request.number
    }));

    requestData(getJiraOptions(TICKET_ID), validatePR);

  } catch (e) {
    console.log(e);
    throwValidationError(`Unable to refresh context for Pull Request ${pull_request.number}.`)
  }
};

generateFreshContext();

