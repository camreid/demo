'use strict';

/**
 * @namespace Account
 */

var server = require('server');

var csrfProtection = require('*/cartridge/scripts/middleware/csrf');
var userLoggedIn = require('*/cartridge/scripts/middleware/userLoggedIn');
var consentTracking = require('*/cartridge/scripts/middleware/consentTracking');

var Resource = require('dw/web/Resource');
var URLUtils = require('dw/web/URLUtils');

var pageMetaHelper = require('*/cartridge/scripts/helpers/pageMetaHelper');
var ContentModel   = require('*/cartridge/models/content');
var ContentUtils   = require('*/cartridge/scripts/helpers/contentUtils');

var siteUtils = require('*/cartridge/scripts/util/siteUtils.js');
var isBRCEmeaRegion = siteUtils.isBRCEmeaRegion();

/**
 * Checks if the email value entered is correct format
 * @param {string} email - email string to check if valid
 * @returns {boolean} Whether email is valid
 */
function validateEmail(email) {
    var regex = /^[\w.%+-]+@[\w.-]+\.[\w]{2,}$/;
    return regex.test(email);
}

/**
 * Account-Show : The Account-Show endpoint will render the shopper's account page. Once a shopper logs in they will see is a dashboard that displays profile, address, payment and order information.
 * @name Base/Account-Show
 * @function
 * @memberof Account
 * @param {middleware} - server.middleware.https
 * @param {middleware} - userLoggedIn.validateLoggedIn
 * @param {middleware} - consentTracking.consent
 * @param {querystringparameter} - registration - A flag determining whether or not this is a newly registered account
 * @param {category} - senstive
 * @param {renders} - isml
 * @param {serverfunction} - get
 */
server.get('Show', server.middleware.https, userLoggedIn.validateLoggedIn, consentTracking.consent, function (req, res, next) {
    var CustomerMgr = require('dw/customer/CustomerMgr');
    var Resource = require('dw/web/Resource');
    var URLUtils = require('dw/web/URLUtils');
    var accountHelpers = require('*/cartridge/scripts/account/accountHelpers');
    var reportingUrlsHelper = require('*/cartridge/scripts/reportingUrls');
    var reportingURLs;

    // Get reporting event Account Open url
    if (req.querystring.registration && req.querystring.registration === 'submitted') {
        reportingURLs = reportingUrlsHelper.getAccountOpenReportingURLs(CustomerMgr.registeredCustomerCount);
    }

    var accountModel = accountHelpers.getAccountModel(req);

    res.render('account/accountDashboard', {
        account: accountModel,
        accountlanding: true,
        breadcrumbs: [
            {
                htmlValue: Resource.msg('global.home', 'common', null),
                url: URLUtils.home().toString(),
            },
            {
                htmlValue: Resource.msg('global.home', 'common', null),
                url: URLUtils.home().toString(),
            },
        ],
        reportingURLs: reportingURLs,
    });
    next();
});

/**
 * Account-Login : The Account-Login endpoint will render the shopper's account page. Once a shopper logs in they will see is a dashboard that displays profile, address, payment and order information.
 * @name Base/Account-Login
 * @function
 * @memberof Account
 * @param {middleware} - server.middleware.https
 * @param {middleware} - csrfProtection.validateAjaxRequest
 * @param {querystringparameter} - rurl - redirect url. The value of this is a number. This number then gets mapped to an endpoint set up in oAuthRenentryRedirectEndpoints.js
 * @param {httpparameter} - loginEmail - The email associated with the shopper's account.
 * @param {httpparameter} - loginPassword - The shopper's password
 * @param {httpparameter} - loginRememberMe - Whether or not the customer has decided to utilize the remember me feature.
 * @param {httpparameter} - csrf_token - a CSRF token
 * @param {category} - sensitive
 * @param {returns} - json
 * @param {serverfunction} - post
 *
 */
server.post('Login', server.middleware.https, csrfProtection.validateAjaxRequest, function (req, res, next) {
    var CustomerMgr = require('dw/customer/CustomerMgr');
    var Resource = require('dw/web/Resource');
    var URLUtils = require('dw/web/URLUtils');
    var Site = require('dw/system/Site');
    var Transaction = require('dw/system/Transaction');

    var accountHelpers = require('*/cartridge/scripts/helpers/accountHelpers');
    var emailHelpers = require('*/cartridge/scripts/helpers/emailHelpers');
    var hooksHelper = require('*/cartridge/scripts/helpers/hooks');

    var email = req.form.loginEmail;
    var password = req.form.loginPassword;
    var rememberMe = true;

    var customerLoginResult = Transaction.wrap(function () {
        var authenticateCustomerResult = CustomerMgr.authenticateCustomer(email, password);

        if (authenticateCustomerResult.status !== 'AUTH_OK') {
            var errorCodes = {
                ERROR_CUSTOMER_DISABLED: 'error.message.account.disabled',
                ERROR_CUSTOMER_LOCKED: 'error.message.account.locked',
                ERROR_CUSTOMER_NOT_FOUND: Resource.msgf('error.message.customer.not.found', 'login', null, URLUtils.url('Account-Register')),
                ERROR_PASSWORD_EXPIRED: 'error.message.password.expired',
                ERROR_PASSWORD_MISMATCH: 'error.message.password.mismatch',
                ERROR_UNKNOWN: 'error.message.error.unknown',
                default: 'error.message.login.form',
            };

            var errorMessageKey = errorCodes[authenticateCustomerResult.status] || errorCodes.default;
            var errorMessage = Resource.msg(errorMessageKey, 'login', null);

            return {
                error: true,
                errorMessage: errorMessage,
                status: authenticateCustomerResult.status,
                authenticatedCustomer: null,
            };
        }

        return {
            error: false,
            errorMessage: null,
            status: authenticateCustomerResult.status,
            authenticatedCustomer: CustomerMgr.loginCustomer(authenticateCustomerResult, rememberMe),
        };
    });

    if (customerLoginResult.error) {
        if (customerLoginResult.status === 'ERROR_CUSTOMER_LOCKED') {
            var context = {
                customer: CustomerMgr.getCustomerByLogin(email) || null,
            };

            var emailObj = {
                to: email,
                subject: Resource.msg('subject.account.locked.email', 'login', null),
                from: Site.current.getCustomPreferenceValue('customerServiceEmail') || 'noreply@brooksrunning.com',
                type: emailHelpers.emailTypes.accountLocked,
            };

            hooksHelper('app.customer.email', 'sendEmail', [emailObj, 'account/accountLockedEmail', context], function () {});
        }

        res.json({
            error: [customerLoginResult.errorMessage || Resource.msg('error.message.login.form', 'login', null)],
        });

        return next();
    }

    if (customerLoginResult.authenticatedCustomer) {
        res.setViewData({ authenticatedCustomer: customerLoginResult.authenticatedCustomer });
        res.json({
            success: true,
            redirectUrl: accountHelpers.getLoginRedirectURL(req.querystring.rurl, req.session.privacyCache, false, false),
        });

        req.session.privacyCache.set('args', null);
    } else {
        res.json({ error: [Resource.msg('error.message.login.form', 'login', null)] });
    }

    return next();
});

/**
 * Account-SubmitRegistration : The Account-SubmitRegistration endpoint is the endpoint that gets hit when a shopper submits their registration for a new account
 * @name Base/Account-SubmitRegistration
 * @function
 * @memberof Account
 * @param {middleware} - server.middleware.https
 * @param {middleware} - csrfProtection.validateAjaxRequest
 * @param {querystringparameter} - rurl - redirect url. The value of this is a number. This number then gets mapped to an endpoint set up in oAuthRenentryRedirectEndpoints.js
 * @param {httpparameter} - dwfrm_profile_customer_firstname - Input field for the shoppers's first name
 * @param {httpparameter} - dwfrm_profile_customer_lastname - Input field for the shopper's last name
 * @param {httpparameter} - dwfrm_profile_customer_phone - Input field for the shopper's phone number
 * @param {httpparameter} - dwfrm_profile_customer_email - Input field for the shopper's email address
 * @param {httpparameter} - dwfrm_profile_customer_emailconfirm - Input field for the shopper's email address
 * @param {httpparameter} - dwfrm_profile_login_password - Input field for the shopper's password
 * @param {httpparameter} - dwfrm_profile_login_passwordconfirm: - Input field for the shopper's password to confirm
 * @param {httpparameter} - dwfrm_profile_customer_addtoemaillist - Checkbox for whether or not a shopper wants to be added to the mailing list
 * @param {httpparameter} - csrf_token - hidden input field CSRF token
 * @param {category} - sensitive
 * @param {returns} - json
 * @param {serverfunction} - post
 */
server.post('SubmitRegistration', server.middleware.https, function (req, res, next) {
    var CustomerMgr = require('dw/customer/CustomerMgr');
    var Resource = require('dw/web/Resource');

    var formErrors = require('*/cartridge/scripts/formErrors');

    var registrationForm = server.forms.getForm('profile');

    // form validation
    if (registrationForm.customer.email.value.toLowerCase() !== registrationForm.customer.emailconfirm.value.toLowerCase()) {
        registrationForm.customer.email.valid = false;
        registrationForm.customer.emailconfirm.valid = false;
        registrationForm.customer.emailconfirm.error = Resource.msg('error.message.mismatch.email', 'forms', null);
        registrationForm.valid = false;
    }

    if (registrationForm.login.password.value !== registrationForm.login.passwordconfirm.value) {
        registrationForm.login.password.valid = false;
        registrationForm.login.passwordconfirm.valid = false;
        registrationForm.login.passwordconfirm.error = Resource.msg('error.message.mismatch.newpassword', 'forms', null);
        registrationForm.valid = false;
    }

    if (!CustomerMgr.isAcceptablePassword(registrationForm.login.password.value)) {
        registrationForm.login.password.valid = false;
        registrationForm.login.passwordconfirm.valid = false;
        registrationForm.login.passwordconfirm.error = Resource.msg('error.message.password.constraints.not.matched', 'forms', null);
        registrationForm.valid = false;
    }

    // setting variables for the BeforeComplete function
    var registrationFormObj = {
        firstName: registrationForm.customer.firstname.value,
        lastName: registrationForm.customer.lastname.value,
        phone: registrationForm.customer.phone.value,
        email: registrationForm.customer.email.value,
        emailConfirm: registrationForm.customer.emailconfirm.value,
        password: registrationForm.login.password.value,
        passwordConfirm: registrationForm.login.passwordconfirm.value,
        validForm: registrationForm.valid,
        form: registrationForm,
    };

    if (registrationForm.valid) {
        res.setViewData(registrationFormObj);

        this.on('route:BeforeComplete', function (req, res) {
            // eslint-disable-line no-shadow
            var Transaction = require('dw/system/Transaction');
            var accountHelpers = require('*/cartridge/scripts/helpers/accountHelpers');
            var authenticatedCustomer;
            var serverError;

            // getting variables for the BeforeComplete function
            var registrationForm = res.getViewData(); // eslint-disable-line

            if (registrationForm.validForm) {
                var login = registrationForm.email;
                var password = registrationForm.password;

                // attempt to create a new user and log that user in.
                try {
                    Transaction.wrap(function () {
                        var error = {};
                        var newCustomer = CustomerMgr.createCustomer(login, password);

                        var authenticateCustomerResult = CustomerMgr.authenticateCustomer(login, password);
                        if (authenticateCustomerResult.status !== 'AUTH_OK') {
                            error = { authError: true, status: authenticateCustomerResult.status };
                            throw error;
                        }

                        authenticatedCustomer = CustomerMgr.loginCustomer(authenticateCustomerResult, false);

                        if (!authenticatedCustomer) {
                            error = { authError: true, status: authenticateCustomerResult.status };
                            throw error;
                        } else {
                            // assign values to the profile
                            var newCustomerProfile = newCustomer.getProfile();

                            newCustomerProfile.firstName = registrationForm.firstName;
                            newCustomerProfile.lastName = registrationForm.lastName;
                            newCustomerProfile.phoneHome = registrationForm.phone;
                            newCustomerProfile.email = registrationForm.email;
                        }
                    });
                } catch (e) {
                    if (e.authError) {
                        serverError = true;
                    } else {
                        var errMsg = Resource.msg('error.message.username.invalid', 'forms', null);
                        if (e.causeName === 'LoginNotUniqueException') {
                            errMsg = Resource.msg('error.message.username.alreadyused', 'forms', null);
                        }
                        registrationForm.validForm = false;
                        registrationForm.form.customer.email.valid = false;
                        registrationForm.form.customer.emailconfirm.valid = false;
                        registrationForm.form.customer.email.error = errMsg;
                    }
                }
            }

            delete registrationForm.password;
            delete registrationForm.passwordConfirm;
            formErrors.removeFormValues(registrationForm.form);

            if (serverError) {
                res.setStatusCode(500);
                res.json({
                    success: false,
                    errorMessage: Resource.msg('error.message.unable.to.create.account', 'login', null),
                });

                return;
            }

            if (registrationForm.validForm) {
                // send a registration email
                accountHelpers.sendCreateAccountEmail(authenticatedCustomer.profile);

                res.setViewData({ authenticatedCustomer: authenticatedCustomer });
                res.json({
                    success: true,
                    redirectUrl: accountHelpers.getLoginRedirectURL(req.querystring.rurl, req.session.privacyCache, true, false),
                });

                req.session.privacyCache.set('args', null);
            } else {
                res.json({
                    fields: formErrors.getFormErrors(registrationForm),
                });
            }
        });
    } else {
        res.json({
            fields: formErrors.getFormErrors(registrationForm),
        });
    }

    return next();
});

/**
 * Account-EditProfile : The Account-EditProfile endpoint renders the page that allows a shopper to edit their profile. The edit profile form is prefilled with the shopper's first name, last name, phone number and email
 * @name Base/Account-EditProfile
 * @function
 * @memberof Account
 * @param {middleware} - server.middleware.https
 * @param {middleware} - csrfProtection.generateToken
 * @param {middleware} - userLoggedIn.validateLoggedIn
 * @param {middleware} - consentTracking.consent
 * @param {category} - sensitive
 * @param {renders} - isml
 * @param {serverfunction} - get
 */
server.get('EditProfile', server.middleware.https, csrfProtection.generateToken, userLoggedIn.validateLoggedIn, consentTracking.consent, function (req, res, next) {
    var Resource = require('dw/web/Resource');
    var URLUtils = require('dw/web/URLUtils');
    var CustomerMgr = require('dw/customer/CustomerMgr');
    var accountHelpers = require('*/cartridge/scripts/account/accountHelpers');

    var customer = CustomerMgr.getCustomerByCustomerNumber(req.currentCustomer.profile.customerNo);
    var profile = customer.getProfile();

    var accountModel = accountHelpers.getAccountModel(req);
    var profileForm = server.forms.getForm('profile');
    profileForm.clear();
    profileForm.customer.firstname.value = accountModel.profile.firstName;
    profileForm.customer.lastname.value = accountModel.profile.lastName;
    profileForm.customer.phone.value = accountModel.profile.phone;
    profileForm.customer.email.value = accountModel.profile.email;
    profileForm.customer.addtoemaillist.value = profile.custom.emailSubscription;
    if (profileForm.customer.birthday) {
        profileForm.customer.birthday.value = '';
        if (profile.birthday) {
            const Calendar = require('dw/util/Calendar');
            const StringUtils = require('dw/util/StringUtils');
            const currentLocaleId = req.locale.id;
            const birthDateCalendar= new Calendar(profile.birthday);

            const formatCalendarLocaleId = isBRCEmeaRegion && currentLocaleId.includes('en_') ? 'en_GB' : currentLocaleId;
            profileForm.customer.birthday.value = StringUtils.formatCalendar(birthDateCalendar, formatCalendarLocaleId, Calendar.INPUT_DATE_PATTERN);
        }
    }

    res.render('account/profile', {
        profileForm: profileForm,
        profile: profile,
        breadcrumbs: [
            {
                htmlValue: Resource.msg('global.home', 'common', null),
                url: URLUtils.home().toString(),
            },
            {
                htmlValue: Resource.msg('page.title.myaccount', 'account', null),
                url: URLUtils.url('Account-Show').toString(),
            },
            {
                htmlValue: Resource.msg('page.title.personaldetails', 'account', null),
            },
        ],
    });
    next();
});

/**
 * Account-SaveProfile : The Account-SaveProfile endpoint is the endpoint that gets hit when a shopper has edited their profile
 * @name Base/Account-SaveProfile
 * @function
 * @memberof Account
 * @param {middleware} - server.middleware.https
 * @param {middleware} - csrfProtection.validateAjaxRequest
 * @param {httpparameter} - dwfrm_profile_customer_firstname - Input field for the shoppers's first name
 * @param {httpparameter} - dwfrm_profile_customer_lastname - Input field for the shopper's last name
 * @param {httpparameter} - dwfrm_profile_customer_phone - Input field for the shopper's phone number
 * @param {httpparameter} - dwfrm_profile_customer_email - Input field for the shopper's email address
 * @param {httpparameter} - dwfrm_profile_customer_emailconfirm - Input field for the shopper's email address
 * @param {httpparameter} - dwfrm_profile_login_password  - Input field for the shopper's password
 * @param {httpparameter} - csrf_token - hidden input field CSRF token
 * @param {category} - sensititve
 * @param {returns} - json
 * @param {serverfunction} - post
 */
server.post('SaveProfile', server.middleware.https, csrfProtection.validateAjaxRequest, function (req, res, next) {
    var Transaction = require('dw/system/Transaction');
    var CustomerMgr = require('dw/customer/CustomerMgr');
    var Resource = require('dw/web/Resource');
    var URLUtils = require('dw/web/URLUtils');
    var accountHelpers = require('*/cartridge/scripts/helpers/accountHelpers');

    var formErrors = require('*/cartridge/scripts/formErrors');

    var profileForm = server.forms.getForm('profile');
    var result = {
        firstName: profileForm.customer.firstname.value,
        lastName: profileForm.customer.lastname.value,
        phone: profileForm.customer.phone.value,
        email: profileForm.customer.email.value,
        password: profileForm.login.password.value,
        profileForm: profileForm,
        addToEmailList: profileForm.customer.addtoemaillist.value,
    };
    if (profileForm.valid) {
        res.setViewData(result);
        this.on('route:BeforeComplete', function (req, res) {
            // eslint-disable-line no-shadow
            var formInfo = res.getViewData();
            var customer = CustomerMgr.getCustomerByCustomerNumber(req.currentCustomer.profile.customerNo);
            var profile = customer.getProfile();
            var customerLogin;
            var status;

            Transaction.wrap(function () {
                status = profile.credentials.setPassword(formInfo.password, formInfo.password, true);

                if (status.error) {
                    formInfo.profileForm.login.password.valid = false;
                    formInfo.profileForm.login.password.error = Resource.msg('error.message.currentpasswordnomatch', 'forms', null);
                } else {
                    customerLogin = profile.credentials.setLogin(formInfo.email, formInfo.password);
                }
            });

            delete formInfo.password;

            if (customerLogin) {
                Transaction.wrap(function () {
                    profile.setFirstName(formInfo.firstName);
                    profile.setLastName(formInfo.lastName);
                    profile.setEmail(formInfo.email);
                    profile.setPhoneHome(formInfo.phone);
                    profile.custom.emailSubscription = formInfo.addToEmailList;
                });

                // Send account edited email
                accountHelpers.sendAccountEditedEmail(customer.profile);

                delete formInfo.profileForm;

                res.json({
                    success: true,
                    redirectUrl: URLUtils.url('Account-Show').toString(),
                });
            } else {
                if (!status.error) {
                    formInfo.profileForm.customer.email.valid = false;
                    formInfo.profileForm.customer.email.error = Resource.msg('error.message.username.invalid', 'forms', null);
                }

                delete formInfo.profileForm;

                res.json({
                    success: false,
                    fields: formErrors.getFormErrors(profileForm),
                });
            }
        });
    } else {
        res.json({
            success: false,
            fields: formErrors.getFormErrors(profileForm),
        });
    }

    return next();
});

/**
 * Account-EditPassword : The Account-EditPassword endpoint renders thes edit password pages. This page allows the shopper to change their password for their account
 * @name Base/Account-EditPassword
 * @function
 * @memberof Account
 * @param {middleware} - server.middleware.https
 * @param {middleware} - csrfProtection.generateToken
 * @param {middleware} - userLoggedIn.validateLoggedIn
 * @param {middleware} - consentTracking.consent
 * @param {category} - sensitive
 * @param {renders} - isml
 * @param {serverfunction} - get
 */
server.get('EditPassword', server.middleware.https, csrfProtection.generateToken, userLoggedIn.validateLoggedIn, consentTracking.consent, function (req, res, next) {
    var Resource = require('dw/web/Resource');
    var URLUtils = require('dw/web/URLUtils');

    var profileForm = server.forms.getForm('profile');
    profileForm.clear();
    res.render('account/password', {
        profileForm: profileForm,
        breadcrumbs: [
            {
                htmlValue: Resource.msg('global.home', 'common', null),
                url: URLUtils.home().toString(),
            },
            {
                htmlValue: Resource.msg('page.title.myaccount', 'account', null),
                url: URLUtils.url('Account-Show').toString(),
            },
        ],
    });
    next();
});

/**
 * Account-SavePassword : The Account-SavePassword endpoint is the endpoit that handles changing the shopper's password
 * @name Base/Account-SavePassword
 * @function
 * @memberof Account
 * @param {middleware} - server.middleware.https
 * @param {middleware} - csrfProtection.validateAjaxRequest
 * @param {httpparameter} - dwfrm_profile_login_currentpassword - Input field for the shopper's current password
 * @param {httpparameter} - dwfrm_profile_login_newpasswords_newpassword - Input field for the shopper's new password
 * @param {httpparameter} - dwfrm_profile_login_newpasswords_newpasswordconfirm - Input field for the shopper to confirm their new password
 * @param {httpparameter} - csrf_token - hidden input field CSRF token
 * @param {category} - sensitive
 * @param {returns} - json
 * @param {serverfunction} - post
 */
server.post('SavePassword', server.middleware.https, csrfProtection.validateAjaxRequest, function (req, res, next) {
    var Transaction = require('dw/system/Transaction');
    var CustomerMgr = require('dw/customer/CustomerMgr');
    var Resource = require('dw/web/Resource');
    var URLUtils = require('dw/web/URLUtils');

    var formErrors = require('*/cartridge/scripts/formErrors');

    var profileForm = server.forms.getForm('profile');
    var newPasswords = profileForm.login.newpasswords;
    // form validation
    if (newPasswords.newpassword.value !== newPasswords.newpasswordconfirm.value) {
        profileForm.valid = false;
        newPasswords.newpassword.valid = false;
        newPasswords.newpasswordconfirm.valid = false;
        newPasswords.newpasswordconfirm.error = Resource.msg('error.message.mismatch.newpassword', 'forms', null);
    }

    var result = {
        currentPassword: profileForm.login.currentpassword.value,
        newPassword: newPasswords.newpassword.value,
        newPasswordConfirm: newPasswords.newpasswordconfirm.value,
        profileForm: profileForm,
    };

    if (profileForm.valid) {
        res.setViewData(result);
        this.on('route:BeforeComplete', function () {
            // eslint-disable-line no-shadow
            var formInfo = res.getViewData();
            var customer = CustomerMgr.getCustomerByCustomerNumber(req.currentCustomer.profile.customerNo);
            var status;
            Transaction.wrap(function () {
                status = customer.profile.credentials.setPassword(formInfo.newPassword, formInfo.currentPassword, true);
            });
            if (status.error) {
                if (!CustomerMgr.isAcceptablePassword(newPasswords.newpassword.value)) {
                    formInfo.profileForm.login.newpasswords.newpassword.valid = false;
                    formInfo.profileForm.login.newpasswords.newpassword.error = Resource.msg('error.message.password.constraints.not.matched', 'forms', null);
                } else {
                    formInfo.profileForm.login.currentpassword.valid = false;
                    formInfo.profileForm.login.currentpassword.error = Resource.msg('error.message.currentpasswordnomatch', 'forms', null);
                }

                delete formInfo.currentPassword;
                delete formInfo.newPassword;
                delete formInfo.newPasswordConfirm;
                delete formInfo.profileForm;

                res.json({
                    success: false,
                    fields: formErrors.getFormErrors(profileForm),
                });
            } else {
                delete formInfo.currentPassword;
                delete formInfo.newPassword;
                delete formInfo.newPasswordConfirm;
                delete formInfo.profileForm;

                res.json({
                    success: true,
                    redirectUrl: URLUtils.url('Account-Show').toString(),
                });
            }
        });
    } else {
        res.json({
            success: false,
            fields: formErrors.getFormErrors(profileForm),
        });
    }
    return next();
});

/**
 * Account-PasswordResetDialogForm : The Account-PasswordResetDialogForm endpoint is the endpoint that gets hit once the shopper has clicked forgot password and has submitted their email address to request to reset their password
 * @name Base/Account-PasswordResetDialogForm
 * @function
 * @memberof Account
 * @param {middleware} - server.middleware.https
 * @param {querystringparameter} - mobile - a flag determining whether or not the shopper is on a mobile sized screen
 * @param {httpparameter} - loginEmail - Input field, the shopper's email address
 * @param {category} - sensitive
 * @param {returns} - json
 * @param {serverfunction} - post
 */
server.post('PasswordResetDialogForm', server.middleware.https, function (req, res, next) {
    var CustomerMgr = require('dw/customer/CustomerMgr');
    var Resource = require('dw/web/Resource');
    var URLUtils = require('dw/web/URLUtils');
    var accountHelpers = require('*/cartridge/scripts/helpers/accountHelpers');

    var email = req.form.loginEmail;
    var errorMsg;
    var isValid;
    var resettingCustomer;
    var mobile = req.querystring.mobile;
    var receivedMsgHeading = Resource.msg('label.resetpasswordreceived', 'login', null);
    var receivedMsgBody = Resource.msg('msg.requestedpasswordreset', 'login', null);
    var buttonText = Resource.msg('button.text.loginform', 'login', null);
    var returnUrl = URLUtils.url('Login-Show').toString();
    if (email) {
        isValid = validateEmail(email);
        if (isValid) {
            resettingCustomer = CustomerMgr.getCustomerByLogin(email);
            if (resettingCustomer) {
                accountHelpers.sendPasswordResetEmail(email, resettingCustomer);
            }
            res.json({
                success: true,
                receivedMsgHeading: receivedMsgHeading,
                receivedMsgBody: receivedMsgBody,
                buttonText: buttonText,
                mobile: mobile,
                returnUrl: returnUrl,
            });
        } else {
            errorMsg = Resource.msg('error.message.passwordreset', 'login', null);
            res.json({
                fields: {
                    loginEmail: errorMsg,
                },
            });
        }
    } else {
        errorMsg = Resource.msg('error.message.required', 'login', null);
        res.json({
            fields: {
                loginEmail: errorMsg,
            },
        });
    }
    next();
});

/**
 * Account-PasswordReset : The Account-PasswordReset endpoint renders the forgot your password form that allows a shopper to submit their email address in order to request a password change
 * @name Base/Account-PasswordReset
 * @function
 * @memberof Account
 * @param {middleware} - server.middleware.https
 * @param {category} - sensitive
 * @param {renders} - isml
 * @param {serverfunction} - get
 */
server.get('PasswordReset', server.middleware.https, function (req, res, next) {
    var apiContent = ContentUtils.getMetaDataContent('Account-PasswordReset');
    if (apiContent) {
        var content = new ContentModel(apiContent, 'content/contentAsset');

        pageMetaHelper.setPageMetaData(req.pageMetaData, content);
        pageMetaHelper.setPageMetaTags(req.pageMetaData, content);
    }

    var breadcrumbs = [
        {
            htmlValue: Resource.msg('global.home', 'common', null),
            url: URLUtils.home().toString(),
        },
        {
            htmlValue: Resource.msg('link.login.forgotpassword', 'login', null),
            url: URLUtils.url('Account-PasswordReset').toString(),
        },
    ];
    var profileForm = server.forms.getForm('profile');
    profileForm.clear();

    res.render('account/password/requestPasswordReset', {
        breadcrumbs: breadcrumbs,
        profileForm: profileForm,
    });
    next();
});

/**
 * Account-SetNewPassword : The Account-SetNewPassword endpoint renders the page that displays the password reset form
 * @name Base/Account-SetNewPassword
 * @function
 * @memberof Account
 * @param {middleware} - server.middleware.https
 * @param {middleware} - consentTracking.consent
 * @param {querystringparameter} - Token - SFRA utilizes this token to retrieve the shopper
 * @param {category} - sensitive
 * @param {renders} - isml
 * @param {serverfunction} - get
 */
server.get('SetNewPassword', server.middleware.https, consentTracking.consent, function (req, res, next) {
    var CustomerMgr = require('dw/customer/CustomerMgr');
    var URLUtils = require('dw/web/URLUtils');
    var apiContent = ContentUtils.getMetaDataContent('Account-PasswordReset');
    if (apiContent) {
        var content = new ContentModel(apiContent, 'content/contentAsset');

        pageMetaHelper.setPageMetaData(req.pageMetaData, content);
        pageMetaHelper.setPageMetaTags(req.pageMetaData, content);
    }
    var passwordForm = server.forms.getForm('newPasswords');
    passwordForm.clear();
    var token = req.querystring.Token;
    var resettingCustomer = CustomerMgr.getCustomerByToken(token);

    var breadcrumbs = [
        {
            htmlValue: Resource.msg('global.home', 'common', null),
            url: URLUtils.home().toString(),
        },
        {
            htmlValue: Resource.msg('label.forgotpassword', 'login', null)
        },
    ];

    if (!resettingCustomer) {
        res.redirect(URLUtils.url('Account-PasswordReset'));
    } else {
        res.render('account/password/newPassword', { passwordForm: passwordForm, token: token, breadcrumbs: breadcrumbs });
    }
    next();
});

/**
 * Account-SaveNewPassword : The Account-SaveNewPassword endpoint handles resetting a shoppers password. This is the last step in the forgot password user flow. (This step does not log the shopper in.)
 * @name Base/Account-SaveNewPassword
 * @function
 * @memberof Account
 * @param {middleware} - server.middleware.https
 * @param {querystringparameter} - Token - SFRA utilizes this token to retrieve the shopper
 * @param {httpparameter} - dwfrm_newPasswords_newpassword - Input field for the shopper's new password
 * @param {httpparameter} - dwfrm_newPasswords_newpasswordconfirm  - Input field to confirm the shopper's new password
 * @param {httpparameter} - save - unutilized param
 * @param {category} - sensitive
 * @param {renders} - isml
 * @param {serverfunction} - post
 */
server.post('SaveNewPassword', server.middleware.https, function (req, res, next) {
    var Transaction = require('dw/system/Transaction');
    var Resource = require('dw/web/Resource');

    var passwordForm = server.forms.getForm('newPasswords');
    var token = req.querystring.Token;

    if (passwordForm.newpassword.value !== passwordForm.newpasswordconfirm.value) {
        passwordForm.valid = false;
        passwordForm.newpassword.valid = false;
        passwordForm.newpasswordconfirm.valid = false;
        passwordForm.newpassword.error = Resource.msg('error.message.mismatch.newpassword', 'forms', null);
        passwordForm.newpasswordconfirm.error = Resource.msg('error.message.mismatch.newpassword', 'forms', null);
    }

    if (passwordForm.valid) {
        var result = {
            newPassword: passwordForm.newpassword.value,
            newPasswordConfirm: passwordForm.newpasswordconfirm.value,
            token: token,
            passwordForm: passwordForm,
        };
        res.setViewData(result);
        this.on('route:BeforeComplete', function (req, res) {
            // eslint-disable-line no-shadow
            var CustomerMgr = require('dw/customer/CustomerMgr');
            var URLUtils = require('dw/web/URLUtils');
            var Site = require('dw/system/Site');
            var emailHelpers = require('*/cartridge/scripts/helpers/emailHelpers');

            var formInfo = res.getViewData();
            var status;
            var resettingCustomer;
            Transaction.wrap(function () {
                resettingCustomer = CustomerMgr.getCustomerByToken(formInfo.token);
                status = resettingCustomer.profile.credentials.setPasswordWithToken(formInfo.token, formInfo.newPassword);
            });
            if (status.error) {
                passwordForm.newpassword.valid = false;
                passwordForm.newpasswordconfirm.valid = false;
                passwordForm.newpassword.error = Resource.msg('error.message.resetpassword.invalidformentry', 'forms', null);
                passwordForm.newpasswordconfirm.error = Resource.msg('error.message.resetpassword.invalidformentry', 'forms', null);
                res.render('account/password/newPassword', {
                    passwordForm: passwordForm,
                    token: token,
                });
            } else {
                var email = resettingCustomer.profile.email;
                var url = URLUtils.https('Login-Show');
                var objectForEmail = {
                    firstName: resettingCustomer.profile.firstName,
                    lastName: resettingCustomer.profile.lastName,
                    url: url,
                };

                var emailObj = {
                    to: email,
                    subject: Resource.msg('subject.profile.resetpassword.email', 'login', null),
                    from: Site.current.getCustomPreferenceValue('customerServiceEmail') || 'noreply@brooksrunning.com',
                    type: emailHelpers.emailTypes.passwordReset,
                };

                emailHelpers.sendEmail(emailObj, 'account/password/passwordChangedEmail', objectForEmail);
                res.redirect(URLUtils.url('Login-Show'));
            }
        });
    } else {
        res.render('account/password/newPassword', { passwordForm: passwordForm, token: token });
    }
    next();
});

/**
 * Account-Register : This endpoint is called to load the register page
 * @name Base/Account-Register
 * @function
 * @memberof Register
 * @param {middleware} - consentTracking.consent
 * @param {middleware} - server.middleware.https
 * @param {querystringparameter} - rurl - Redirect URL
 * @param {querystringparameter} - action - Action on submit of Register Form
 * @param {category} - sensitive
 * @param {renders} - isml
 * @param {serverfunction} - get
 */
server.get('Register', consentTracking.consent, server.middleware.https, function (req, res, next) {
    var target = req.querystring.rurl || 1;
    var createAccountUrl = URLUtils.url('Account-SubmitRegistration', 'rurl', target).relative().toString();

    var breadcrumbs = [
        {
            htmlValue: Resource.msg('global.home', 'common', null),
            url: URLUtils.home().toString(),
        },
        {
            htmlValue: Resource.msg('global.login', 'common', null),
            url: URLUtils.url('Login-Show').toString(),
        },
    ];

    var profileForm = server.forms.getForm('profile');
    profileForm.clear();

    res.render('/account/register', {
        profileForm: profileForm,
        breadcrumbs: breadcrumbs,
        createAccountUrl: createAccountUrl,
    });

    next();
});

/**
 * Account-Header : The Account-Header endpoint is used as a remote include to include the login/account menu in the header
 * @name Base/Account-Header
 * @function
 * @memberof Account
 * @param {middleware} - server.middleware.include
 * @param {querystringparameter} - mobile - a flag determining whether or not the shopper is on a mobile sized screen this determines what isml template to render
 * @param {category} - sensitive
 * @param {renders} - isml
 * @param {serverfunction} - get
 */
server.get('Header', server.middleware.include, function (req, res, next) {
    var template = req.querystring.mobile ? 'account/mobileHeader' : 'account/header';
    res.render(template, { name: req.currentCustomer.profile ? req.currentCustomer.profile.firstName : null });
    next();
});

module.exports = server.exports();
