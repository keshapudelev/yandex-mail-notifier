import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const popupSource = readFileSync(new URL('../popup/popup.js', import.meta.url), 'utf8');
const popupSourceWithoutBootstrap = popupSource.replace(/\ninitialize\(\);\s*$/, '');

test('popup listener does not answer messages for another extension context', () => {
    assert.notEqual(popupSourceWithoutBootstrap, popupSource, 'popup bootstrap was not removed in test');

    let listener;
    const context = vm.createContext({
        chrome: {
            runtime: {
                onMessage: {
                    addListener(callback) {
                        listener = callback;
                    },
                },
            },
        },
    });

    vm.runInContext(`${popupSourceWithoutBootstrap}\ncreateBackgroundListener();`, context);

    assert.equal(typeof listener, 'function');
    const result = listener({target: 'offscreen', type: 'PARSE_XML'}, {});
    assert.equal(result, false);
    assert.equal(result instanceof Promise, false);
});

async function runMessageAction(sendMessage) {
    const warnings = [];
    let removed = false;
    const context = vm.createContext({
        chrome: {
            runtime: {sendMessage},
        },
        document: {
            body: {
                addEventListener() {},
            },
            querySelector() {
                return {remove() { removed = true; }};
            },
        },
        showWarning(message, withRefresh) {
            warnings.push({message, withRefresh});
        },
    });

    const actionsSource = readFileSync(new URL('../popup/actions.js', import.meta.url), 'utf8');
    vm.runInContext(actionsSource, context);
    context.messageButtonClicked('mark-readed', 'message-1', 'account-1');
    await new Promise(resolve => setImmediate(resolve));

    return {removed, warnings};
}

test('successful mail operation removes the message', async () => {
    const result = await runMessageAction(() => Promise.resolve(true));

    assert.equal(result.removed, true);
    assert.deepEqual(result.warnings, []);
});

test('failed mail operation shows an actionable warning', async () => {
    const result = await runMessageAction(() => Promise.resolve(false));

    assert.equal(result.removed, false);
    assert.equal(result.warnings.length, 1);
    assert.equal(result.warnings[0].withRefresh, 1);
});

test('runtime messaging error shows an actionable warning', async () => {
    const result = await runMessageAction(() => Promise.reject(new Error('message channel closed')));

    assert.equal(result.removed, false);
    assert.equal(result.warnings.length, 1);
    assert.equal(result.warnings[0].withRefresh, 1);
});
