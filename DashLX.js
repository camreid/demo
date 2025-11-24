'use strict';

const server = require('server');
const consentTracking = require('app_brooks_base/cartridge/scripts/middleware/consentTracking');
const dashService = require('app_brooks_base/cartridge/scripts/dashLX/dashLXServiceMgr.js');
const Logger = require('dw/system/Logger');
const features = require('app_brooks_custom/cartridge/scripts/helpers/features.js').configuration;
const siteUtils = require('app_brooks_custom/cartridge/scripts/util/siteUtils');

/**
 * DashLX-StartSession : The DashLX-StartSession endpoint handle Ajax sent to and from Dash to start a runners session
 * Requires Consent Tracking - on sandboxes comment out line 19 if consent tracking is not setup properly.
 * @name DashLX-StartSession
 * @function StartSession
 * @memberof DashLX
 * @returns {SfraResponse} Header html code to be included on the support.brooksrunning.com
 */
server.post('StartSession',
    consentTracking.consent,
    server.middleware.https,
    function (req, res, next) {
        const dashServiceInstance = dashService.generate(req);
        const endpoint = 'beginSession';

        let response;
        if (siteUtils.isFeatureEnabled('BRC-218')) {
            const cohortId = req.querystring.cohortId;
            response = makeDashRequest(dashServiceInstance, req, endpoint, cohortId);
        } else {
            response = makeDashRequest(dashServiceInstance, req, endpoint);
        }

        res.json(response);
        next();
    }
);

/**
 * DashLX-UserCohortStatus returns the given user's status regarding the cohort association and device sync status
 * 0 -> 'Email not associated with cohort' | 1 -> 'Email associated with cohort but no device connected' |
 * 2 -> 'Email associated with cohort and device connected'
 * @name DashLX-UserCohortStatus
 * @function UserCohortStatus
 * @memberof DashLX
 * @returns {SfraResponse} Header html code to be included on the support.brooksrunning.com
 */
server.post('UserCohortStatus',
    consentTracking.consent,
    server.middleware.https,
    function (req, res, next) {
        const dashServiceInstance = dashService.getUserCohortStatus(req);
        const endpoint = 'userCohortStatus';

        let response;
        if (siteUtils.isFeatureEnabled('BRC-218')) {
            const cohortId = req.querystring.cohortId;
            response = makeDashRequest(dashServiceInstance, req, endpoint, cohortId);
        } else {
            response = makeDashRequest(dashServiceInstance, req, endpoint);
        }

        res.json(response);
        next();
    }
);


/**
 * DashLX-RefreshDashLXSession refreshes the user's DashLX session
 *
 * @name DashLX-RefreshDashLXSession
 * @function RefreshDashLXSession
 * @memberof DashLX
 * @returns {SfraResponse} Refresh Token to pass through to Dash Web Component to persist session
 */
server.post('RefreshDashLXSession',
    consentTracking.consent,
    server.middleware.https,
    function (req, res, next) {
        const dashServiceInstance = dashService.getRefreshDashLXSessionToken(req);
        const endpoint = 'refresh-session';

        let serviceResponse;
        if (siteUtils.isFeatureEnabled('BRC-218')) {
            const cohortId = req.querystring.cohortId;
            serviceResponse = makeDashRequest(dashServiceInstance, req, endpoint, cohortId);
        } else {
            serviceResponse = makeDashRequest(dashServiceInstance, req, endpoint);
        }

        res.json(serviceResponse);
        next();
    }
);

/**
 * @param {Object} dashServiceInstance - generated service targeting corresponding endpoint and Request Type
 * @param {Object} req  - Possible json body of request required by Post
 * @param {string} endpoint The dash service endpoint
 * @returns {Object} result - Service object that can be called.
 */
function makeDashRequest(dashServiceInstance, req, endpoint, cohortId) {
    let result = {};
    const objectHelper = require('*/cartridge/scripts/util/object');

    try {
        const creds = features.getDashLXCreds();
        let body = {};

        if (endpoint !== 'refresh-session') {
            if (siteUtils.isFeatureEnabled('BRC-218') && cohortId) {
                body.cohort = creds.dashCohort[cohortId].cohortId;
            } else {
                body.cohort = creds.dashCohort;
            }
            body.email = objectHelper.resolveProperty(req.currentCustomer, 'raw', 'profile', 'email') || '';
        }

        if (endpoint === 'beginSession') {
            body.token = creds.dashToken;
            body.redirect_uri = req.form.redirect;
        } else if (endpoint === 'refresh-session') {
            body.session = req.form.sessionId;
        }

        const returnResponse = dashServiceInstance.call(body);

        if (returnResponse.status === 'OK') {
            result = returnResponse.object;
        } else {
            result = {
                errorMessage: returnResponse.errorMessage,
                result: returnResponse
            };
            Logger.error('[dashLX.js] service responded with invalid data. Error: {0}, more details: {1}', result.errorMessage, JSON.stringify(result.result));
        }
    } catch (e) {
        Logger.error('[dashLX.js] crashed at l.{0}. ERROR: {1}.', e.lineNumber, e.message);
    }

    return result;
}

module.exports = server.exports();
