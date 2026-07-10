import {UnauthorizedError} from "./errors/Unauthorized.js";
import {NoInternetError} from "./errors/NoInternet.js";
import apiConnector from "./ApiConnector.js";
import visual from "./visual.js";
import Accounts from "./accounts.js";
import WebSocketConnection from "./WebSocketConnection.js";
import Settings from "./options_backend.js";
import * as StateController from "./state_controller.js";
import State from "./state_controller.js";
import version from "./versionController.js";

export function openLoginPage() {
    chrome.tabs.create({"url":"https://passport.yandex.ru/auth?retpath=https%3A%2F%2Fmail.yandex.ru"});
}

export async function getCounters(){
    const countersData = await apiConnector.fetchCounters();
    if (!countersData) {
        return;
    }
    let totalMessages = 0;
    const counters = {}
    const accountSettings = await Settings.getAccountSettings();
    for (let account of countersData) {
        if(Settings.checkAccountSetting(accountSettings, account.uid, "counter") !== false) {
            totalMessages += account.data.counters.unread;
        }
        counters[account.uid] = account.data.counters
    }
    return {
        counters: counters,
        total: totalMessages
    }
}


export async function getTotalCount() {
    const countersData = await getCounters();
    if (!countersData) {
        return;
    }
    return countersData.total;
}

export async function getCurrentCount() {
    if(Accounts.currentAccount === null) {
        await Accounts.loadAccounts();
    }
    const countersData = await getCounters();
    if (!countersData) {
        return;
    }
    return countersData.counters[Accounts.currentAccount].unread;
}

export async function fetchYandexMailCounters() {
    try {
        let allAccountsCounter = await Settings.getSettings("allAccountsCounter");
        let totalMessages;
        if(allAccountsCounter) {
            totalMessages = await getTotalCount();
        }
        else{
            totalMessages = await getCurrentCount();
        }

        visual.setMailsCount(totalMessages);
        State.setState(StateController.STATE_CONNECTED);
    } catch (e) {
        if (e instanceof UnauthorizedError) {
            State.setUnauthorized();
        }
        if (e instanceof NoInternetError) {
            State.setOffline()
        }
    }
}

export function openMessage(uid, mid) {
    chrome.tabs.create({
        url: 'https://mail.yandex.ru/message?uid=' + uid.toString() + '&ids=' + mid.toString()
    }, () => {
    });
}

// Выполняет операцию над письмом с ретраем: если ckey протух или offscreen
// не отдал ключ, сбрасываем ckey и пробуем ещё раз со свежим.
async function runMailOper(operFn, mid){
    for (let attempt = 0; attempt < 2; attempt++) {
        const cKey = await Accounts.getCKey();
        if (!cKey) {
            Accounts.dropCKey();
            continue;
        }
        const result = await operFn(mid, cKey);
        if (result && result.search("<status reason=\"ok\"/>") !== -1) {
            return true;
        }
        // операция не прошла - возможно, протух ckey; сбросим и повторим
        Accounts.dropCKey();
    }
    return false;
}

export async function markReaded(uid, mid){
    return runMailOper(apiConnector.messageMarkReaded, mid);
}

export async function markSpam(uid, mid){
    return runMailOper(apiConnector.messageMarkSpam, mid);
}

export async function deleteMessage(uid, mid){
    return runMailOper(apiConnector.messageDelete, mid);
}

const connections = {};

function breakOldConnections(accounts, connections) {
    const oldUIDs = Object.keys(connections).filter(uid=>!Object.keys(accounts).includes(uid))
    for(let uid of oldUIDs){
        const connection = connections[uid].connection;
        if(connection){
            connection.close();
        }
    }
}

export async function checkConnections() {
    let accounts = await Accounts.getLocalAccounts();
    breakOldConnections(accounts, connections)
    if (Object.values(accounts).length === 0) {
        State.setUnauthorized()
    }
    else {
        if(State.getState() === StateController.STATE_CONNECTED) {
            for (let uid in accounts) {
                if (!(uid in connections)) {
                    connections[uid] = new WebSocketConnection(uid)
                }
                if (!connections[uid].connected) {
                    connections[uid].connect();
                }
            }
        }
    }

    return true;
}

export async function healthCheck() {
    fetchYandexMailCounters().then(()=>checkConnections())
    version.checkUpdate()
}

export async function initialize() {
    await Settings.initSettings();
    State.setState(StateController.STATE_OFFLINE);
}