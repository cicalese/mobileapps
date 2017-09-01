#!/usr/bin/env node

'use strict';

const BBPromise = require('bluebird');
const fs = require("fs");
const preq = require('preq');

const BLACKLIST = require('../etc/feed/blacklist');
const SPECIAL = 'Special:';
const SPECIAL2 = 'special:';

// Will be set later
let lang;
let topMonthlyPageViews;
let topPagesFile;
let parsoidBaseUri;

const fixTitleForRequest = (pageTitle) => {
    return encodeURIComponent(pageTitle);
};

const uriForParsoid = (pageTitle) => {
    return `${parsoidBaseUri}/${fixTitleForRequest(pageTitle)}`;
};

const writePages = (myPages) => {
    const logger = fs.createWriteStream(topPagesFile, { flags: 'w' });
    logger.write(`{ "items": [\n`);
    myPages.forEach((page, index, array) => {
        if (page) {
            const comma = (index < array.length - 1) ? ',' : '';
            const title = page.title && page.title.replace(/"/g, '\\"');
            logger.write(`  { "title": "${title}", "rev": "${page.rev}" }${comma}\n`);
        }
    });
    logger.write(`]}\n`);
    logger.end();
};

const processOnePage = (page) => {
    process.stdout.write('.');
    return preq.get({ uri: uriForParsoid(page.title) })
    .then((rsp) => {
        return BBPromise.delay(300, rsp); // avoid timeouts
    }).then((rsp) => {
        if (rsp.status !== 200) {
            if (rsp.status === 302) {
                page.title = rsp.headers.location;
                return processOnePage(page);
            }
            process.stderr.write(` WARNING: skipping parsoid for ${page.title}!`);
            return BBPromise.resolve();
        }
        const etag = rsp.headers.etag;
        const revMatch = /"(\S+?)"/m.exec(etag);
        page.rev = revMatch[1];
        return page;
    }).catch((err) => {
        if (err.status === 504) {
            process.stderr.write(` Timeout for ${page.title}: ${uriForParsoid(page.title)}! `);
            // time out encountered: wait a few seconds and try again
            return BBPromise.delay(2000).then(() => processOnePage(page));
        } else {
            process.stderr.write(` ERROR getting metadata ${page.title}: ${err.status}! `);
        }
    });
};

const getETags = (myPages) => {
    return BBPromise.map(myPages, (page) => {
        return processOnePage(page);
    }, { concurrency: 1 })
    .then((myPages) => {
        writePages(myPages);
    });
};

const getTopPageViews = () => {
    return preq.get({ uri: topMonthlyPageViews })
    .then((rsp) => {
        return rsp.body.items[0].articles.filter((article) => {
            const title = article.article;
            return (title.indexOf(SPECIAL) !== 0 && title.indexOf(SPECIAL2) !== 0
                && !BLACKLIST.includes(title));
        }).map((article) => {
            return { "title": article.article };
        });
    }).catch((err) => {
        process.stderr.write(`ERROR: could not get top monthly page views: ${err}`);
    }).then((myPages) => {
        getETags(myPages);
    });
};

// MAIN
const arg = process.argv[2];
if (arg) {
    lang = arg;
    topMonthlyPageViews = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${lang}.wikipedia/all-access/2017/06/all-days`; // eslint-disable-line max-len
    topPagesFile = `../private/top-pages/top-pages.${lang}.json`;
    parsoidBaseUri = `https://${lang}.wikipedia.org/api/rest_v1/page/html`;

    getTopPageViews();
}