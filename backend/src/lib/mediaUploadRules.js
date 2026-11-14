/** Domain rule for promoting an upload intent to an uploaded media asset. */
export async function assertUploadedObjectExists({ objectKey, objectExists }) {
    if (typeof objectKey !== 'string' || !objectKey.trim()) {
        throw new TypeError('A valid storage object key is required.');
    }
    if (typeof objectExists !== 'function') {
        throw new TypeError('A storage object existence checker is required.');
    }
    const exists = await objectExists(objectKey);
    if (!exists) {
        throw Object.assign(
            new Error('The upload is not present in T-CARE Storage yet. Upload the file before completing the media asset.'),
            { statusCode: 409, code: 'MEDIA_OBJECT_NOT_FOUND' }
        );
    }
    return true;
}
