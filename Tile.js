'use strict';

/**
 * @namespace Tile
 */

var server = require('server');

var cache = require('app_brooks_base/cartridge/scripts/middleware/cache');

/**
 * Tile-Show : Used to return data for rendering a product tile
 * @name Base/Tile-Show
 * @function
 * @memberof Tile
 * @param {middleware} - cache.applyPromotionSensitiveCache
 * @param {querystringparameter} - pid - the Product ID
 * @param {querystringparameter} - ratings - boolean to determine if the reviews should be shown in the tile
 * @param {querystringparameter} - swatches - boolean to determine if the swatches should be shown in the tile
 * @param {querystringparameter} - pview - string to determine if the product factory returns a model for a tile or a pdp/quickview display
 * @param {querystringparameter} - quantity - Quantity
 * @param {querystringparameter} - dwvar_<pid>_color - Color Attribute ID
 * @param {querystringparameter} - dwvar_<pid>_size - Size Attribute ID
 * @param {category} - non-sensitive
 * @param {renders} - isml
 * @param {serverfunction} - get
 */
server.get('Show', cache.applyPromotionSensitiveCache, function (req, res, next) {
    var URLUtils = require('dw/web/URLUtils');
    var ProductFactory = require('app_brooks_base/cartridge/scripts/factories/product');

    // The req parameter has a property called querystring. In this use case the querystring could
    // have the following:
    // pid - the Product ID
    // ratings - boolean to determine if the reviews should be shown in the tile.
    // swatches - boolean to determine if the swatches should be shown in the tile.
    //
    // pview - string to determine if the product factory returns a model for
    //         a tile or a pdp/quickview display
    var productTileParams = { pview: 'tile' };
    var queryString = req.querystring;
    Object.keys(queryString).forEach(function (key) {
        productTileParams[key] = queryString[key];
    });

    var product;
    var productUrl;
    var quickViewUrl;

    // TODO: remove this logic once the Product factory is
    // able to handle the different product types
    try {
        product = ProductFactory.get(productTileParams);
        productUrl = URLUtils.url('Product-Show', 'pid', product.id).relative().toString();
        quickViewUrl = URLUtils.url('Product-ShowQuickView', 'pid', product.id)
            .relative().toString();
    } catch (e) {
        product = false;
        productUrl = URLUtils.url('Home-Show');// TODO: change to coming soon page
        quickViewUrl = URLUtils.url('Home-Show');
        var Logger = require('dw/system/Logger');
        Logger.error('Error occurred while getting product model in Tile-Show: ' + e.message + ' (' + e.fileName + ':' + e.lineNumber + ')');
    }

    var context = {
        product: product,
        urls: {
            product: productUrl,
            quickView: quickViewUrl
        },
        display: {},
        requestedProductID: productTileParams.pid,
        hideTile: false
    };

    Object.keys(queryString).forEach(function (key) {
        if (queryString[key] === 'true') {
            context.display[key] = true;
        } else if (queryString[key] === 'false') {
            context.display[key] = false;
        }
    });

    res.render('product/gridTile.isml', context);

    next();
});

module.exports = server.exports();
