import { t } from "~/i18n";

export const PREVIEW_RECENT_URL_LIMIT = 10;

export const PREVIEW_ERROR_CODE_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  ERR_NAME_NOT_RESOLVED: t("DNS address could not be found"),
  ERR_NAME_RESOLUTION_FAILED: t("DNS address could not be found"),
  ERR_CONNECTION_REFUSED: t("Connection refused"),
  ERR_CONNECTION_RESET: t("Connection was reset"),
  ERR_CONNECTION_CLOSED: t("Connection was closed"),
  ERR_CONNECTION_TIMED_OUT: t("Connection timed out"),
  ERR_INTERNET_DISCONNECTED: t("No internet connection"),
  ERR_TIMED_OUT: t("Connection timed out"),
  ERR_CERT_AUTHORITY_INVALID: t("Certificate authority is not trusted"),
  ERR_CERT_COMMON_NAME_INVALID: t("Certificate hostname mismatch"),
  ERR_CERT_DATE_INVALID: t("Certificate is expired or not yet valid"),
  ERR_TOO_MANY_REDIRECTS: t("Too many redirects"),
});
