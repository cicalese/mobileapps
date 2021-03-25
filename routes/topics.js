'use strict';

const BBPromise = require('bluebird');
const sUtil = require('../lib/util');
const mUtil = require('../lib/mobile-util');
const parsoid = require('../lib/parsoid-access');
const Facts = require('../lib/structured/Facts');
const api = require('../lib/api-util');

/**
 * The main router object
 */
const router = sUtil.router();

/**
 * The main application object reported when this module is require()d
 */
let app;

function getPageSummary(req, title) {
    const path = `page/summary/${encodeURIComponent(title)}`;
    const restReq = {
        headers: {
            'accept-language': req.headers['accept-language']
        }
    };
    return api.restApiGet(req, path, restReq);
}

function getEntitiesForTitles(req, keys) {
    const entitiesByTitle = {};
    for (var i = 0; i < keys.length; i++) {
        const title = keys[i];
        entitiesByTitle[title] = getPageSummary(req, title).then(res => {
            return res;
        }, () => {
            return {};
        });
    }
    return BBPromise.props(entitiesByTitle);
}

function factsPromise(app, req) {
    return parsoid.getParsoidHtml(req)
        .then((res) => {
            const meta = parsoid.getRevAndTidFromEtag(res.headers) || {};
            meta._headers = {
                'Content-Language': res.headers && res.headers['content-language'],
                Vary: res.headers && res.headers.vary
            };
            return mUtil.createDocument(res.body).then((doc) => {
                return new Facts(doc, meta).promise;
            });
        });
}

/**
 * GET /topics/v0/{title}{/revision}
 */
router.get('/:project/:language/:title/:revision?', (req, res) => {
    req.params.domain = req.params.language + '.' + req.params.project + '.org';
    return factsPromise(app, req).then((structuredPage) => {
        const linkedEntities = structuredPage.output.linkedEntities;
        const keys = Object.keys(linkedEntities);
        return getEntitiesForTitles(req, keys, false).then((summariesByTitle) => {
            const result = {};
            result.metadata = {};
            result.metadata.revision = structuredPage.metadata.revision;
            result.output = {};
            const sections = [];
            result.output.sections = sections;
            for (const section of structuredPage.output.sections) {
                const newSection = {};
                newSection.title = section.title;
                sections.push(newSection);
                newSection.links = [];
                for (const paragraph of section.paragraphs) {
                    for (const fact of paragraph.facts) {
                        for (const link of fact.links ) {
                            const title = link.title;
                            const summaryResponse = summariesByTitle[title];
                            if (!summaryResponse
                                || !summaryResponse.body
                                || !summaryResponse.body.wikibase_item) {
                                continue;
                            }
                            newSection.links.push({
                                title: title,
                                wikidataItem: summaryResponse.body.wikibase_item
                            });
                        }
                    }
                }
            }
            return result;
        });
    }).then((structuredPage) => {
        res.status(200);
        mUtil.setContentType(res, mUtil.CONTENT_TYPES.structuredPage);
        mUtil.setETag(res, structuredPage.metadata.revision);
        mUtil.setLanguageHeaders(res, structuredPage.metadata._headers);
        mUtil.setContentSecurityPolicy(res, app.conf.mobile_html_csp);
        res.json(structuredPage.output).end();
    });
});

module.exports = function(appObj) {
    app = appObj;
    return {
        path: '/topics/v0',
        skip_domain: true,
        router
    };
};
