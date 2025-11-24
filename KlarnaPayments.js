
'use strict';

var server = require('server');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');

server.post('ExpressCheckout', server.middleware.https, csrfProtection.validateRequest, function (req, res, next) {
    var BasketMgr = require('dw/order/BasketMgr');
    var Transaction = require('dw/system/Transaction');
    var URLUtils = require('dw/web/URLUtils');
    var ArrayList = require('dw/util/ArrayList');
    var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
    var shippingHelpers = require('*/cartridge/scripts/checkout/shippingHelpers');
    var validationHelpers = require('*/cartridge/scripts/helpers/basketValidationHelpers');
    var collections = require('*/cartridge/scripts/util/collections');
    var klarnaHelper = require('*/cartridge/scripts/klarna/helpers/klarnaHelpers');

    var currentBasket = BasketMgr.getCurrentBasket();
    if (!currentBasket) {
        res.redirect(URLUtils.url('Cart-Show'));
        return next();
    }

    var expressForm = server.forms.getForm('klarnaexpresscheckout');
    var klarnaDetails = klarnaHelper.getExpressFormDetails(expressForm);

    var validatedProducts = validationHelpers.validateProducts(currentBasket);
    if (validatedProducts.error) {
        res.redirect(URLUtils.url('Cart-Show'));
        return next();
    }

    // Pre-populate shipping details
    var hasShippingMethod = true;
    var shipment = currentBasket.defaultShipment;
    COHelpers.copyCustomerAddressToShipment(klarnaDetails, shipment);

    var applicableShippingMethods = new ArrayList(shippingHelpers.getApplicableShippingMethods(shipment, klarnaDetails));
    var hasShippingMethodSet = !!shipment.shippingMethod;

    // Check if the selected on Cart Page method is still applicable
    if (hasShippingMethodSet) {
        hasShippingMethodSet = collections.find(applicableShippingMethods, function (item) {
            return item.ID === shipment.shippingMethodID;
        });
    }

    // If we have no shipping method or it's no longer applicable - try to select the first one
    if (!hasShippingMethodSet) {
        var shippingMethod = collections.first(applicableShippingMethods);
        if (shippingMethod) {
            Transaction.wrap(function () {
                shippingHelpers.selectShippingMethod(shipment, shippingMethod.ID);
            });
        } else {
            hasShippingMethod = false;
        }
    }

    var isPhoneValid = expressForm.phone.valid;
    if (!isPhoneValid) {
        klarnaDetails.phone = klarnaHelper.formatPhoneNumber(expressForm.phone);
    }
    // Always pre-populate billing address & email
    klarnaHelper.setExpressBilling(currentBasket, klarnaDetails);

    // Calculate the basket & shipments
    Transaction.wrap(function () {
        COHelpers.ensureNoEmptyShipments(req);
    });

    var basketCalculationHelpers = require('*/cartridge/scripts/helpers/basketCalculationHelpers');
    Transaction.wrap(function () {
        basketCalculationHelpers.calculateTotals(currentBasket);
    });

    var stage = 'payment';
    if (!hasShippingMethod) {
        // Redirect to shipping section
        stage = 'shippingMethod';
    }

    session.privacy.KlarnaExpressCategory = true;
    var hasOnlyGiftCertificatesLineItems = currentBasket.productLineItems.empty && currentBasket.giftCertificateLineItems.length > 0;
    if (!hasOnlyGiftCertificatesLineItems) {
        var shippingFormErrors = COHelpers.validateShippingForm(expressForm.address);
        if (shippingFormErrors && Object.keys(shippingFormErrors).length > 0) {
            session.custom.kebShippingFormErrors = true;
            stage = 'shipping';
        } else {
            var features = require('*/cartridge/scripts/helpers/features.js').configuration;
            if (features.isShippingAddressValidationEnabled() && features.isInformaticaEnabled()) {
                var addressService = require('*/cartridge/scripts/helpers/informaticaApiMgr');
                addressService.cass(currentBasket.defaultShipment.shippingAddress);
            }

            var shippingAddress = currentBasket.defaultShipment.shippingAddress;
            if (!empty(shippingAddress.stateCode) && shippingAddress.stateCode.length > 2) {
                session.privacy.isKlarnaStateCode = true;
            }
        }
    }

    res.redirect(URLUtils.url('Checkout-Begin', 'stage', stage));
    return next();
});

module.exports = server.exports();
