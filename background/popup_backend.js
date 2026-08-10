import Accounts from "./accounts.js";
import ApiConnector from "./ApiConnector.js";
import * as actions from "./actions.js";
import {getCounters, openMessage} from "./actions.js";
import * as State_controller from "./state_controller.js";
import State from "./state_controller.js";
import Settings from "./options_backend.js";
import VersionController from "./versionController.js";

class Popup {


    async sendMessage(action, data) {
        return chrome.runtime.sendMessage({
            action: action,
            target: "popup",
            data: data
        }).catch(() => {
        })
    }

    accountChanged() {
        chrome.runtime.sendMessage({
            'action': "accountChanged",
            'target': 'popup',
        }).catch(() => {
        })
    }

    showStateMessage(message, showRefresh){
        chrome.runtime.sendMessage({
            'action':"showWarning",
            'target': 'popup',
            'data': {
                message: message,
                showRefresh: showRefresh
            }
        })
    }

    loadAccountData() {
        Accounts.loadAccounts()
            .then(accounts => this.sendMessage("loadAccountData", accounts)).catch(e => {
            if (State.getState() === State_controller.STATE_OFFLINE){
                this.showStateMessage(State.getHumanMessage(State.getState()), 2);
                return
            }
            actions.openLoginPage()
        })
    }

    fetchCounters() {
        actions.getCounters()
            .then(counters => {
                this.sendMessage("loadCounters", counters)
                actions.fetchYandexMailCounters()
            }).catch(e => {
            if (State.getState() === State_controller.STATE_OFFLINE){
                this.showStateMessage(State.getHumanMessage(State.getState()), 2);
                return
            }
            actions.openLoginPage()
        })
    }

    loadMessages() {
        ApiConnector.loadMessagesAsText()
            .then(messagesAsText => this.sendMessage("loadMessages", messagesAsText));
    }

    readMessage(uid, mids) {
        this.fetchCounters();
        this.sendMessage('markReadMessage', {
            uid: uid,
            mids: mids
        })
    }

    unreadMessage(uid, mids) {
        this.fetchCounters();
        this.sendMessage('markNewMessage', {
            uid: uid
        });
    }
}

const popup = new Popup()
export default popup;

export function listenToPopup() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.target !== "background") return;
        switch (message.action) {
            case "loadAccountData":
                popup.loadAccountData();
                break;
            case "loadCounters":
                popup.fetchCounters();
                break;
            case "loadMessages":
                popup.loadMessages();
                break;
            case "openMessage":
                actions.openMessage(message.data.uid, message.data.mid);
                break;
            case "changeAccount":
                Accounts.changeAccount(message.data.uid);
                break;
            case "logout":
                Accounts.logout(message.data.uid);
                break;
            case "markRead":
                actions.markReaded(message.data.uid, message.data.mid)
                    .then((result) => sendResponse(result))
                    .catch(() => sendResponse(false))
                break;
            case "markSpam":
                actions.markSpam(message.data.uid, message.data.mid)
                    .then((result) => sendResponse(result))
                    .catch(() => sendResponse(false))
                break;
            case "delete":
                actions.deleteMessage(message.data.uid, message.data.mid)
                    .then((result) => sendResponse(result))
                    .catch(() => sendResponse(false))
                break;
            case "reply":
                actions.markReaded(message.data.uid, message.data.mid)
                chrome.tabs.create({"url": "https://mail.yandex.ru/?uid=" + message.data.uid + "#compose?origin=elmt_mailchrome&oper=reply&ids=" + message.data.mid})
                break;
            case "openSettings":
                chrome.runtime.openOptionsPage();
                break;
            case "getCachedVersion_Popup":
                Settings.getSettings("updateInPopup").then(flag=>{
                    if(flag){
                        return VersionController.cachedUpdateData();
                    }
                    else{
                        return null;
                    }
                }).then((newVersionInfo)=>sendResponse(newVersionInfo));
                break;
            case "getAccountSettings":
                Settings.getAccountSettings().then(settings=>sendResponse(settings));
                return true;
                break;
            case "updateAccountSettings":
                Settings.updateAccountSettings(
                    message.data.uid,
                    message.data.preference,
                    message.data.value,
                ).then(settings=>{
                    sendResponse(settings)
                });
                return true;
                break;
            default:
                break;
        }
        return true;
    })
}
