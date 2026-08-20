const GSC_SERVICE_ACCOUNT_PATH_ENV = "GSC_SERVICE_ACCOUNT_PATH";
const GSC_PROPERTY_SCOPE_ENV = "GSC_PROPERTY_SCOPE";
export function getGscConfig() {
    const keyFilePath = process.env[GSC_SERVICE_ACCOUNT_PATH_ENV];
    const propertyScope = process.env[GSC_PROPERTY_SCOPE_ENV];
    if (!keyFilePath || keyFilePath.trim().length === 0)
        return null;
    if (!propertyScope || propertyScope.trim().length === 0)
        return null;
    return { keyFilePath, propertyScope };
}
//# sourceMappingURL=gsc-token.js.map