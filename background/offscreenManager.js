export default {
    async sendMessage(args){
        await setupOffscreenDocument("offscreen/offscreen.html");
        args.target = 'offscreen';
        // Иногда offscreen-документ не успевает зарегистрировать листенер
        // сразу после создания - тогда sendMessage возвращает пусто или падает.
        // Повторяем несколько раз, пока не придёт ответ.
        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                const response = await chrome.runtime.sendMessage(args);
                if (response) {
                    return response;
                }
            } catch (e) {
                // приёмник ещё не готов - подождём и повторим
            }
            await new Promise(resolve => setTimeout(resolve, 120));
        }
        return null;
    }
}

let creating;
async function setupOffscreenDocument(path) {
    const offscreenUrl = chrome.runtime.getURL(path);
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [offscreenUrl]
    });

    if (existingContexts.length > 0) {
        return;
    }

    if (creating) {
        await creating;
    } else {
        creating = chrome.offscreen.createDocument({
            url: path,
            reasons: ['CLIPBOARD', 'DOM_SCRAPING'],
            justification: 'reason for needing the document',
        });
        await creating;
        creating = null;
    }
}