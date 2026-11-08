import { env } from '../config/env.js';

const baseUrl = `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1`;

function headers() {
    return {
        apikey: env.SUPABASE_SECRET_KEY
    };
}

/**
 * Server-side Supabase Storage adapter.
 *
 * The backend owns the Supabase Secret API key. The browser never receives it.
 * Database records should store objectKey + bucket; the binary remains in
 * Supabase Storage.
 */
export async function uploadObject({ objectKey, body, contentType, upsert = false }) {
    const response = await fetch(
        `${baseUrl}/object/${encodeURIComponent(env.SUPABASE_STORAGE_BUCKET)}/${objectKey.split('/').map(encodeURIComponent).join('/')}`, {
            method: 'POST',
            headers: {
                ...headers(),
                'Content-Type': contentType || 'application/octet-stream',
                'x-upsert': String(upsert)
            },
            body
        }
    );

    if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Supabase Storage upload failed (${response.status}): ${detail}`);
    }

    return { bucket: env.SUPABASE_STORAGE_BUCKET, objectKey };
}

export async function removeObject(objectKey) {
    const response = await fetch(`${baseUrl}/object/${encodeURIComponent(env.SUPABASE_STORAGE_BUCKET)}`, {
        method: 'DELETE',
        headers: {
            ...headers(),
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prefixes: [objectKey] })
    });

    if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Supabase Storage delete failed (${response.status}): ${detail}`);
    }
}


export async function createSignedUploadUrl(objectKey, upsert = false) {
    const response = await fetch(`${baseUrl}/object/upload/sign/${encodeURIComponent(env.SUPABASE_STORAGE_BUCKET)}/${objectKey.split('/').map(encodeURIComponent).join('/')}`, {
        method: 'POST',
        headers: {...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ upsert })
    });
    if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Supabase Storage signed upload URL failed (${response.status}): ${detail}`);
    }
    const data = await response.json();
    const relative = data.url || data.signedURL || data.signedUrl;
    if (!relative) throw new Error('Supabase Storage did not return a signed upload URL.');
    const url = relative.startsWith('http') ? relative : `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1${relative.startsWith('/storage/v1') ? relative.slice('/storage/v1'.length) : relative}`;
    return { url, token: data.token ? data.token : null };
}

export async function createSignedDownloadUrl(objectKey, expiresIn = 300) {
    const response = await fetch(`${baseUrl}/object/sign/${encodeURIComponent(env.SUPABASE_STORAGE_BUCKET)}/${objectKey.split('/').map(encodeURIComponent).join('/')}`, {
        method: 'POST',
        headers: {...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn })
    });
    if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Supabase Storage signed download URL failed (${response.status}): ${detail}`);
    }
    const data = await response.json();
    const relative = data.signedURL || data.signedUrl;
    if (!relative) throw new Error('Supabase Storage did not return a signed download URL.');
    const url = relative.startsWith('http') ? relative : `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1${relative.startsWith('/storage/v1') ? relative.slice('/storage/v1'.length) : relative}`;
    return { url };
}