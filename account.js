'use strict';

var AddressModel = require('*/cartridge/models/address');
var URLUtils = require('dw/web/URLUtils');

/**
 * Creates a plain object that contains profile information
 * @param {Object} profile - current customer's profile
 * @returns {Object} an object that contains information about the current customer's profile
 */
function getProfile(profile) {
    var result;
    if (profile) {
        result = {
            firstName: profile.firstName,
            lastName: profile.lastName,
            email: profile.email,
            phone: profile.phone,
            password: '********'
        };
    } else {
        result = null;
    }
    return result;
}

/**
 * Creates an array of plain object that contains address book addresses, if any exist
 * @param {Object} addressBook - target customer
 * @returns {Array<Object>} an array of customer addresses
 */
function getAddresses(addressBook) {
    var result = [];
    if (addressBook) {
        var preferredAddress = addressBook.preferredAddress;

        for (var i = 0, ii = addressBook.addresses.length; i < ii; i++) {
            var address = addressBook.addresses[i];
            if (!preferredAddress || address.ID != preferredAddress.ID) {
                result.push(new AddressModel(address).address);
            }
        }

        if (preferredAddress) {
            result.unshift(new AddressModel(preferredAddress).address);
        }
    }

    return result;
}

/**
 * @description gets checkout addresses cosndiering different scebarios for different countries
 * case0 - all addresses match
 * case1 - default match, SOME others don't
 * case2 - default match, ALL others don't
 * case3 - default doesn't match, SOME others do
 * case4 - default doesn't match, ALL others do
 * case5 - no address match
 * @param {Collection} addressesList - not filtered address list
 * @return {Object} addresses - object containing message, addresses and case number
*/

function getCheckoutAddresses(addressesList) {
    // return {
    //     currentCountry: addressesList
    // };
    var addresses = {
        currentCountry: [],
        msgs: [],
        case: 'case0'
    };

    if (!empty(addressesList)) {
        var Resource = require('dw/web/Resource');
        var Locale = require('dw/util/Locale');
        var currentLocale = Locale.getLocale(request.getLocale());
        var currentCountry = currentLocale.country;

        var allAddressesCount = addressesList.length;

        var defaultAddress = addressesList[0];
        var defaultAddressCountryMatch = defaultAddress.countryCode.value == currentCountry;

        var othersAddresses = [];

        if (allAddressesCount > 1) {
            for (var i = 1; i < addressesList.length; i++) {
                var address = addressesList[i];
                var countryMatch = address.countryCode.value == currentCountry;

                if (countryMatch) {
                    othersAddresses.push(address);
                }
            }

            var othersCurrentCountryAddressCount = othersAddresses.length;
            var othersAddressCount = allAddressesCount - 1;
            var allOthersAddressMatch = othersCurrentCountryAddressCount == othersAddressCount;

            if (defaultAddressCountryMatch) {
                if (!allOthersAddressMatch) {
                    if (othersAddresses.length == 0) {
                        addresses.case = 'case2';
                    } else if (othersAddressCount > othersCurrentCountryAddressCount) {
                        addresses.case = 'case1';
                        addresses.msgs = [Resource.msg('checkout.address.case1', 'checkoutRefresh', null), 'changecountry'];
                    }
                } else {
                    addresses.msgs = [Resource.msg('change.address.text', 'checkoutRefresh', null)];
                }
            } else {
                if (!allOthersAddressMatch) {
                    if (othersAddresses.length == 0) {
                        addresses.case = 'case5';
                        addresses.msgs = [Resource.msg('checkout.address.case5', 'checkoutRefresh', null), 'changecountry'];
                    } else if (othersAddressCount > othersCurrentCountryAddressCount) {
                        addresses.case = 'case3';
                        addresses.msgs = [Resource.msg('checkout.address.case3', 'checkoutRefresh', null), 'changecountry'];
                    }
                } else {
                    addresses.case = 'case4';
                    addresses.msgs = [Resource.msg('checkout.address.case4', 'checkoutRefresh', null), 'changecountry'];
                }
            }

            addresses.currentCountry = [defaultAddress].concat(othersAddresses);
        } else {
            addresses.currentCountry = [defaultAddress];

            if (defaultAddressCountryMatch) {
                addresses.msgs = [Resource.msg('change.address.text', 'checkoutRefresh', null)];
            } else {
                addresses.case = 'case5';
                addresses.msgs = [Resource.msg('checkout.address.case5', 'checkoutRefresh', null), 'changecountry'];
            }
        }
    }

    return addresses;
}

/**
 * Creates a plain object that contains the customer's preferred address
 * @param {Object} addressBook - target customer
 * @returns {Object} an object that contains information about current customer's preferred address
 */
function getPreferredAddress(addressBook) {
    var result = null;
    if (addressBook && addressBook.preferredAddress) {
        result = new AddressModel(addressBook.preferredAddress).address;
    }

    return result;
}

/**
 * Creates a plain object that contains payment instrument information
 * @param {Object} wallet - current customer's wallet
 * @returns {Object} object that contains info about the current customer's payment instrument
 */
function getPayment(wallet) {
    if (wallet) {
        var paymentInstruments = wallet.paymentInstruments;
        var paymentInstrument = paymentInstruments[0];

        if (paymentInstrument) {
            return {
                maskedCreditCardNumber: paymentInstrument.maskedCreditCardNumber,
                creditCardType: paymentInstrument.creditCardType,
                creditCardExpirationMonth: paymentInstrument.creditCardExpirationMonth,
                creditCardExpirationYear: paymentInstrument.creditCardExpirationYear
            };
        }
    }
    return null;
}

/**
 * Creates a plain object that contains payment instrument information
 * @param {Object} userPaymentInstruments - current customer's paymentInstruments
 * @returns {Object} object that contains info about the current customer's payment instruments
 */
function getCustomerPaymentInstruments(userPaymentInstruments) {
    var paymentInstruments;

    paymentInstruments = userPaymentInstruments.map(function (paymentInstrument) {
        var result = {
            creditCardHolder: paymentInstrument.creditCardHolder,
            maskedCreditCardNumber: paymentInstrument.maskedCreditCardNumber,
            creditCardType: paymentInstrument.creditCardType,
            creditCardExpirationMonth: paymentInstrument.creditCardExpirationMonth,
            creditCardExpirationYear: paymentInstrument.creditCardExpirationYear,
            UUID: paymentInstrument.UUID
        };

        result.cardTypeImage = {
            src: URLUtils.staticURL('/images/' +
                paymentInstrument.creditCardType.toLowerCase().replace(/\s/g, '') +
                '-dark.svg'),
            alt: paymentInstrument.creditCardType
        };

        return result;
    });

    return paymentInstruments;
}

/**
 * Account class that represents the current customer's profile dashboard
 * @param {Object} currentCustomer - Current customer
 * @param {Object} addressModel - The current customer's preferred address
 * @param {Object} orderModel - The current customer's order history
 * @constructor
 */
function account(currentCustomer, addressModel, orderModel) {
    this.profile = getProfile(currentCustomer.profile);
    this.addresses = getAddresses(currentCustomer.addressBook);
    this.checkoutAddresses = getCheckoutAddresses(this.addresses);
    this.preferredAddress = addressModel || getPreferredAddress(currentCustomer.addressBook);
    this.orderHistory = orderModel;
    this.payment = getPayment(currentCustomer.wallet);
    this.registeredUser = currentCustomer.raw.authenticated && currentCustomer.raw.registered;
    this.isExternallyAuthenticated = currentCustomer.raw.externallyAuthenticated;
    this.customerPaymentInstruments = currentCustomer.wallet
        && currentCustomer.wallet.paymentInstruments
        ? getCustomerPaymentInstruments(currentCustomer.wallet.paymentInstruments)
        : null;
}

account.getCustomerPaymentInstruments = getCustomerPaymentInstruments;

module.exports = account;
