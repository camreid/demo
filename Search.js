'use strict';

/**
 * @namespace Search
 */

var server = require('server');

var cache = require('app_brooks_base/cartridge/scripts/middleware/cache');
var constructorCache = require('*/cartridge/scripts/middleware/constructorCache');
var consentTracking = require('app_brooks_base/cartridge/scripts/middleware/consentTracking');
var pageMetaData = require('app_brooks_base/cartridge/scripts/middleware/pageMetaData');

/**
 * Search-UpdateGrid : This endpoint is called when the shopper changes the "Sort Order" or clicks "More Results" on the Product List page
 * @name Base/Search-UpdateGrid
 * @function
 * @memberof Search
 * @param {querystringparameter} - cgid - Category ID
 * @param {querystringparameter} - srule - Sort Rule ID
 * @param {querystringparameter} - start - Offset of the Page
 * @param {querystringparameter} - sz - Number of Products to Show on the List Page
 * @param {querystringparameter} - prefn1, prefn2 ... prefn(n) - Names of the selected preferences e.g. refinementColor. These will be added to the query parameters only when refinements are selected
 * @param {querystringparameter} - prefv1, prefv2 ... prefv(n) - Values of the selected preferences e.g. Blue. These will be added to the query parameters only when refinements are selected
 * @param {querystringparameter} - selectedUrl - The URL generated with the query parameters included
 * @param {category} - non-sensitive
 * @param {renders} - isml
 * @param {serverfunction} - get
 */
server.get('UpdateGrid', function (req, res, next) {
    var CatalogMgr = require('dw/catalog/CatalogMgr');
    var ProductSearchModel = require('dw/catalog/ProductSearchModel');
    var searchHelper = require('*/cartridge/scripts/helpers/searchHelpers');
    var ProductSearch = require('*/cartridge/models/search/productSearch');
    var queryString = req.querystring;

    var apiProductSearch = new ProductSearchModel();
    apiProductSearch = searchHelper.setupSearch(apiProductSearch, queryString, req.httpParameterMap);

    /**
     * Constructor Implementation
    */
    var productSearch;
    var useFallback = false;
    var constructorUtils = require('*/cartridge/scripts/utils/ConstructorUtils');
    var useConstructor = constructorUtils.isConstructorEnabled();
    if (useConstructor) {
        if ((!queryString.cgid || queryString.cgid === 'global-search') && !constructorUtils.isSearchEnabled()) {
            useConstructor = false;
        }
        if ((queryString.cgid && queryString.cgid !== 'global-search') && !constructorUtils.isBrowseEnabled()) {
            useConstructor = false;
        }
    }
    if (useConstructor) {
        var ConstructorSearchModel = require('*/cartridge/scripts/models/ConstructorSearchModel');
        var constructorSearch = new ConstructorSearchModel(req, apiProductSearch);
        if (constructorSearch.serviceError) {
            useFallback = true;
        } else {
            productSearch = constructorSearch;
        }
    }

    if (!useConstructor || useFallback) {
        apiProductSearch.search();

        productSearch = new ProductSearch(
            apiProductSearch,
            queryString,
            queryString.srule,
            CatalogMgr.getSortingOptions(),
            CatalogMgr.getSiteCatalog().getRoot()
        );
    }

    if (!useConstructor && !apiProductSearch.personalizedSort) {
        searchHelper.applyCache(res);
    }

    res.render('/search/productGrid', {
        productSearch: productSearch
    });

    next();
});

/**
 * Search-Refinebar : The endpoint Search-Refinebar render the refinement bar on product list page, PLP (i.e. the search result page and category listing page)
 * @name Base/Search-Refinebar
 * @function
 * @memberof Search
 * @param {middleware} - constructorCache.applyPromotionSensitiveCache
 * @param {querystringparameter} - q - The search string (when submit product search)
 * @param {querystringparameter} - cgid - category ID (when loading category list page)
 * @param {category} - non-sensitive
 * @param {renders} - isml
 * @param {serverfunction} - get
 */
server.get('Refinebar', constructorCache.applyPromotionSensitiveCache, function (req, res, next) {
    var CatalogMgr = require('dw/catalog/CatalogMgr');
    var ProductSearchModel = require('dw/catalog/ProductSearchModel');
    var ProductSearch = require('*/cartridge/models/search/productSearch');
    var searchHelper = require('*/cartridge/scripts/helpers/searchHelpers');

    var apiProductSearch = new ProductSearchModel();
    apiProductSearch = searchHelper.setupSearch(apiProductSearch, req.querystring, req.httpParameterMap);
    apiProductSearch.search();

    /**
     * Constructor Implementation
    */
    var productSearch;
    var useFallback = false;
    var constructorUtils = require('*/cartridge/scripts/utils/ConstructorUtils');
    var useConstructor = constructorUtils.isConstructorEnabled();
    if (useConstructor) {
        if ((!req.querystring.cgid || req.querystring.cgid === 'global-search') && !constructorUtils.isSearchEnabled()) {
            useConstructor = false;
        }
        if ((req.querystring.cgid && req.querystring.cgid !== 'global-search') && !constructorUtils.isBrowseEnabled()) {
            useConstructor = false;
        }
    }
    if (useConstructor) {
        var ConstructorSearchModel = require('*/cartridge/scripts/models/ConstructorSearchModel');
        var constructorSearch = new ConstructorSearchModel(req, apiProductSearch);
        if (constructorSearch.serviceError) {
            useFallback = true;
        } else {
            productSearch = constructorSearch;
        }
    }

    if (!useConstructor || useFallback) {
        productSearch = new ProductSearch(
            apiProductSearch,
            req.querystring,
            req.querystring.srule,
            CatalogMgr.getSortingOptions(),
            CatalogMgr.getSiteCatalog().getRoot()
        );
    }

    res.render('/search/searchRefineBar', {
        productSearch: productSearch,
        querystring: req.querystring
    });

    next();
}, pageMetaData.computedPageMetaData);

/**
 * Search-ShowAjax : This endpoint is called when a shopper click on any of the refinement eg. color, size, categories
 * @name Base/Search-ShowAjax
 * @function
 * @memberof Search
 * @param {middleware} - constructorCache.applyShortPromotionSensitiveCache
 * @param {middleware} - consentTracking.consent
 * @param {querystringparameter} - cgid - Category ID
 * @param {querystringparameter} - q - query string a shopper is searching for
 * @param {querystringparameter} - prefn1, prefn2 ... prefn(n) - Names of the selected preferences e.g. refinementColor. These will be added to the query parameters only when refinements are selected
 * @param {querystringparameter} - prefv1, prefv2 ... prefv(n) - Values of the selected preferences e.g. Blue. These will be added to the query parameters only when refinements are selected
 * @param {querystringparameter} - pmin - preference for minimum amount
 * @param {querystringparameter} - pmax - preference for maximum amount
 * @param {querystringparameter} - page
 * @param {querystringparameter} - selectedUrl - The URL generated with the query parameters included
 * @param {category} - non-sensitive
 * @param {serverfunction} - get
 */
server.get('ShowAjax', constructorCache.applyShortPromotionSensitiveCache, consentTracking.consent, function (req, res, next) {
    var searchHelper = require('*/cartridge/scripts/helpers/searchHelpers');

    var result = searchHelper.search(req, res);
    if (result.searchRedirect) {
        res.redirect(result.searchRedirect);
        return next();
    }

    res.render('search/searchResultsNoDecorator', {
        productSearch: result.productSearch,
        maxSlots: result.maxSlots,
        reportingURLs: result.reportingURLs,
        isRefinedSearch: result.isRefinedSearch
    });

    return next();
}, pageMetaData.computedPageMetaData);

/**
 * Search-Show : This endpoint is called when a shopper type a query string in the search box
 * @name Base/Search-Show
 * @function
 * @memberof Search
 * @param {middleware} - constructorCache.applyShortPromotionSensitiveCache
 * @param {middleware} - consentTracking.consent
 * @param {querystringparameter} - q - query string a shopper is searching for
 * @param {querystringparameter} - search-button
 * @param {querystringparameter} - lang - default is en_US
 * @param {querystringparameter} - cgid - Category ID
 * @param {category} - non-sensitive
 * @param {renders} - isml
 * @param {serverfunction} - get
 */
server.get('Show', constructorCache.applyShortPromotionSensitiveCache, consentTracking.consent, function (req, res, next) {
    var searchHelper = require('*/cartridge/scripts/helpers/searchHelpers');
    var Resource = require('dw/web/Resource');
    var queryString = req.querystring;

    if (queryString.cgid) {
        var pageLookupResult = searchHelper.getPageDesignerCategoryPage(queryString.cgid);

        if ((pageLookupResult.page && pageLookupResult.page.hasVisibilityRules()) || pageLookupResult.invisiblePage) {
            // the result may be different for another user, do not cache on this level
            // the page itself is a remote include and can still be cached
            res.cachePeriod = 0; // eslint-disable-line no-param-reassign
        }

        if (pageLookupResult.page) {
            res.page(pageLookupResult.page.ID, {}, pageLookupResult.aspectAttributes);
            return next();
        }

        var CatalogMgr = require('dw/catalog/CatalogMgr');
        var SiteUtils = require('*/cartridge/scripts/util/siteUtils');
        var category = CatalogMgr.getCategory(req.querystring.cgid);

        if (!category || !category.online) {
            var URLUtils = require('dw/web/URLUtils');

            res.redirect(URLUtils.url('Home-Show'));
            return this.emit('route:Complete', req, res);
        }
        var isDPDX254Enabled = SiteUtils.isFeatureEnabled('DPDX-254');

        // if page is a View More / View All PLP; deoptimize and prepend viewAll to title.
        if (isDPDX254Enabled) {
            var viewAll;
            var sz = queryString.sz;
            var start = queryString.start;

            if ((category || category.online) && (sz || start)) {
                viewAll = Resource.msg('label.navigation.viewall', 'common', null);
            }
        }
    }

    var template = 'search/searchResults';

    var result = searchHelper.search(req, res);

    if (result.searchRedirect) {
        res.redirect(result.searchRedirect);
        return next();
    }

    if (result.category && result.categoryTemplate) {
        template = result.categoryTemplate;
    }

    var redirectGridUrl = searchHelper.backButtonDetection(req.session.clickStream);
    if (redirectGridUrl) {
        res.redirect(redirectGridUrl);
    }

    // Execute a search without refinements, the count of no refinement search results needs to be displayed in the main header of search result page
    let noRefinementsSearchResult = null;
    if (result.isRefinedSearch) {
        noRefinementsSearchResult = searchHelper.getNoRefinementsSearchResult(req.querystring);
    }

    if (isDPDX254Enabled) {
        res.render(template, {
            productSearch: result.productSearch,
            maxSlots: result.maxSlots,
            reportingURLs: result.reportingURLs,
            category: result.category ? result.category : null,
            canonicalUrl: result.canonicalUrl,
            schemaData: result.schemaData,
            apiProductSearch: result.apiProductSearch,
            isAjax: false,
            noRefinementsSearchResult: noRefinementsSearchResult,
            viewAll: viewAll,
            isRefinedSearch: result.isRefinedSearch
        });
    } else {
        res.render(template, {
            productSearch: result.productSearch,
            maxSlots: result.maxSlots,
            reportingURLs: result.reportingURLs,
            category: result.category ? result.category : null,
            canonicalUrl: result.canonicalUrl,
            schemaData: result.schemaData,
            apiProductSearch: result.apiProductSearch,
            isAjax: false,
            noRefinementsSearchResult: noRefinementsSearchResult,
            isRefinedSearch: result.isRefinedSearch
        });
    }


    return next();
}, pageMetaData.computedPageMetaData);

/**
 * Search-Content : This endpoint is called when a shopper search for something under articles by clicking on the articles tab next to products on Search result page
 * @name Base/Search-Content
 * @function
 * @memberof Search
 * @param {middleware} - cache.applyDefaultCache
 * @param {middleware} - consentTracking.consent
 * @param {querystringparameter} - q - the query string a shopper is searching for
 * @param {querystringparameter} - startingPage - The starting page to display in the case there are multiple pages returned
 * @param {category} - non-sensitive
 * @param {renders} - isml
 * @param {serverfunction} - get
 */
server.get('Content', cache.applyDefaultCache, consentTracking.consent, function (req, res, next) {
    var searchHelper = require('*/cartridge/scripts/helpers/searchHelpers');

    var contentSearch = searchHelper.setupContentSearch(req.querystring);
    res.render('/search/contentGrid', {
        contentSearch: contentSearch
    });
    next();
});

module.exports = server.exports();
