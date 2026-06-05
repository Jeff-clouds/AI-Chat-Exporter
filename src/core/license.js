import { FEATURES, isProFeature } from './features.js';
import { LICENSE_PUBLIC_KEY } from './license-public-key.js';

const LICENSE_STORAGE_KEY = 'aiChatKnowledgeSuiteLicense';
const LICENSE_PREFIX = 'AICK1';

function base64UrlToBytes(value) {
    const padding = '='.repeat((4 - (value.length % 4)) % 4);
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + padding;
    const binary = atob(padded);
    return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function bytesToText(bytes) {
    return new TextDecoder().decode(bytes);
}

function normalizeLicenseCode(code = '') {
    return code.trim().replace(/\s+/g, '');
}

function getStoredLicense() {
    return chrome.storage.local.get(LICENSE_STORAGE_KEY).then(result => result[LICENSE_STORAGE_KEY] || null);
}

function setStoredLicense(license) {
    return chrome.storage.local.set({ [LICENSE_STORAGE_KEY]: license });
}

async function importPublicKey() {
    return crypto.subtle.importKey(
        'jwk',
        LICENSE_PUBLIC_KEY,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
    );
}

async function parseAndVerifyLicense(code) {
    const normalized = normalizeLicenseCode(code);
    const parts = normalized.split('.');
    if (parts.length !== 3 || parts[0] !== LICENSE_PREFIX) {
        throw new Error('授权码格式不正确');
    }

    const [, payloadPart, signaturePart] = parts;
    const payloadBytes = base64UrlToBytes(payloadPart);
    const signatureBytes = base64UrlToBytes(signaturePart);
    const key = await importPublicKey();

    const isValid = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        signatureBytes,
        new TextEncoder().encode(payloadPart)
    );

    if (!isValid) {
        throw new Error('授权码签名无效');
    }

    let payload;
    try {
        payload = JSON.parse(bytesToText(payloadBytes));
    } catch {
        throw new Error('授权码内容无法解析');
    }

    if (payload.expiresAt && new Date(payload.expiresAt).getTime() < Date.now()) {
        throw new Error('授权码已过期');
    }

    return {
        code: normalized,
        payload,
        activatedAt: new Date().toISOString()
    };
}

export async function activateLicense(code) {
    const license = await parseAndVerifyLicense(code);
    await setStoredLicense(license);
    return getLicenseStatus(license);
}

export async function getLicenseStatus(licenseOverride = null) {
    const license = licenseOverride || await getStoredLicense();
    if (!license) {
        return {
            active: false,
            plan: 'free',
            features: Object.keys(FEATURES).filter(feature => FEATURES[feature] === 'free')
        };
    }

    try {
        await parseAndVerifyLicense(license.code);
    } catch (error) {
        return {
            active: false,
            plan: 'free',
            error: error.message,
            features: Object.keys(FEATURES).filter(feature => FEATURES[feature] === 'free')
        };
    }

    return {
        active: true,
        plan: license.payload.plan || 'pro',
        licenseId: license.payload.licenseId || '',
        orderId: license.payload.orderId || '',
        emailHash: license.payload.emailHash || '',
        issuedAt: license.payload.issuedAt || '',
        activatedAt: license.activatedAt || '',
        features: license.payload.features || Object.keys(FEATURES)
    };
}

export async function canUse(feature) {
    if (!isProFeature(feature)) return true;
    const status = await getLicenseStatus();
    return status.active && status.features.includes(feature);
}
