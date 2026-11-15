function fail(statusCode, code, message) {
    return Object.assign(new Error(message), { statusCode, code });
}

function normalizeContentType(contentType) {
    return typeof contentType === 'string' ? contentType.split(';', 1)[0].trim().toLowerCase() : '';
}

/** Promote an upload only when Storage confirms the declared size and content type. */
export async function assertUploadedObjectMatchesIntent({ asset, objectInfo }) {
    if (!asset || typeof asset.objectKey !== 'string' || !asset.objectKey.trim()) {
        throw new TypeError('A valid media asset is required.');
    }
    if (typeof objectInfo !== 'function') {
        throw new TypeError('A storage object metadata checker is required.');
    }
    const actual = await objectInfo(asset.objectKey);
    if (!actual) {
        throw fail(409, 'MEDIA_OBJECT_NOT_FOUND', 'The upload is not present in T-CARE Storage yet. Upload the file before completing the media asset.');
    }
    if (!Number.isSafeInteger(actual.sizeBytes) || actual.sizeBytes <= 0 || !normalizeContentType(actual.contentType)) {
        throw fail(502, 'MEDIA_METADATA_UNAVAILABLE', 'T-CARE Storage did not return valid size and content-type metadata.');
    }
    if (actual.sizeBytes !== asset.sizeBytes) {
        throw fail(409, 'MEDIA_SIZE_MISMATCH', 'The uploaded file size does not match the declared upload size.');
    }
    if (normalizeContentType(actual.contentType) !== normalizeContentType(asset.contentType)) {
        throw fail(409, 'MEDIA_TYPE_MISMATCH', 'The uploaded file type does not match the declared upload type.');
    }
    return true;
}
