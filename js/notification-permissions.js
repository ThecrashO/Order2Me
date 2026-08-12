// ============================================================
// Cross-browser notification permission guidance
// ============================================================

function getNotificationEnvironment() {
    const ua = navigator.userAgent || '';
    const isIos = /iPad|iPhone|iPod/.test(ua)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(ua);
    const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches
        || window.navigator.standalone === true;
    const hasApi = 'Notification' in window;

    if (!window.isSecureContext) {
        return { supported: false, reason: 'insecure', isIos, isAndroid, isStandalone };
    }
    if (isIos && !isStandalone) {
        return { supported: false, reason: 'ios-install', isIos, isAndroid, isStandalone };
    }
    if (!hasApi) {
        return { supported: false, reason: 'unsupported', isIos, isAndroid, isStandalone };
    }
    return {
        supported: true,
        reason: null,
        permission: Notification.permission,
        isIos,
        isAndroid,
        isStandalone
    };
}

function getNotificationStatusMessage() {
    const environment = getNotificationEnvironment();
    if (environment.reason === 'insecure') return 'Notifications require the HTTPS Vercel address.';
    if (environment.reason === 'ios-install') return 'On iPhone/iPad, install Order2Me on the Home Screen first.';
    if (environment.reason === 'unsupported') return 'This browser does not support app notifications.';
    if (environment.permission === 'denied') return 'Notifications are blocked in this device’s settings.';
    return null;
}

function getNotificationHelpMarkup() {
    const environment = getNotificationEnvironment();
    if (environment.reason === 'ios-install') {
        return '<strong>iPhone / iPad</strong><ol><li>Open this site in Safari.</li><li>Tap Share, then Add to Home Screen.</li><li>Open Order2Me from the Home Screen.</li><li>Return here and tap Enable notifications.</li></ol>';
    }
    if (environment.isIos) {
        return '<strong>iPhone / iPad</strong><ol><li>Open Settings → Notifications.</li><li>Select Order2Me.</li><li>Turn on Allow Notifications.</li><li>Return to Order2Me and try the test button.</li></ol>';
    }
    if (environment.isAndroid) {
        return '<strong>Android</strong><ol><li>Tap the lock or site-settings icon beside the address.</li><li>Open Permissions → Notifications.</li><li>Choose Allow.</li><li>Return here and tap Send test notification.</li></ol>';
    }
    return '<strong>Browser settings</strong><ol><li>Open the site information icon beside the address.</li><li>Open Site permissions.</li><li>Set Notifications to Allow.</li><li>Return here and send a test.</li></ol>';
}

function showNotificationPermissionHelp(elementId) {
    const panel = document.getElementById(elementId);
    if (!panel) return;
    panel.innerHTML = getNotificationHelpMarkup();
    panel.classList.remove('d-none');
}

function hideNotificationPermissionHelp(elementId) {
    const panel = document.getElementById(elementId);
    panel?.classList.add('d-none');
}

function watchNotificationPermission(syncCallback) {
    const sync = () => syncCallback?.();
    window.addEventListener('focus', sync);
    window.addEventListener('pageshow', sync);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') sync();
    });

    if (navigator.permissions?.query && 'Notification' in window) {
        navigator.permissions.query({ name: 'notifications' })
            .then(status => { status.onchange = sync; })
            .catch(() => {});
    }
}
