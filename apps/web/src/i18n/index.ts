// Fork patch (self-sites): English source text is the key and the fallback. Catalogs are
// ./de/<module>.json, loaded eagerly so module-level t() calls work; a language change reloads.
// Plurals: tn(count, "{count} file", "{count} files"). See FORK.md.

export type Locale = "en" | "de";
export type LocalePreference = Locale | "system";
// Like a template literal, minus "undefined"/"null": a missing value renders as nothing.
type Params = Readonly<Record<string, string | number | null | undefined>>;

const STORAGE_KEY = "t3code:locale";

const catalogs: Record<Exclude<Locale, "en">, Readonly<Record<string, string>>> = {
  de: Object.assign(
    {},
    ...Object.values(
      import.meta.glob<Record<string, string>>("./de/*.json", { eager: true, import: "default" }),
    ),
  ),
};

function readPreference(): LocalePreference {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    return stored === "en" || stored === "de" ? stored : "system";
  } catch {
    return "system";
  }
}

function resolveLocale(preference: LocalePreference): Locale {
  if (preference !== "system") return preference;
  const languages = globalThis.navigator?.languages ?? [];
  return languages[0]?.toLowerCase().startsWith("de") ? "de" : "en";
}

const preference = readPreference();
export const locale: Locale = resolveLocale(preference);
const messages: Readonly<Record<string, string>> = locale === "en" ? {} : catalogs[locale];

if (typeof document !== "undefined") document.documentElement.lang = locale;

export function getLocalePreference(): LocalePreference {
  return preference;
}

export function setLocalePreference(next: LocalePreference): void {
  try {
    if (next === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
  } catch {
    return;
  }
  if (resolveLocale(next) !== locale || next !== preference) window.location.reload();
}

function interpolate(text: string, params: Params): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name] ?? "") : match,
  );
}

/** Translates English source text; `{name}` placeholders are filled from `params`. */
export function t(source: string, params?: Params): string {
  const text = messages[source] || source;
  return params ? interpolate(text, params) : text;
}

/** `t` for counted text; `{count}` is always available to both forms. */
export function tn(count: number, one: string, other: string, params?: Params): string {
  return t(count === 1 ? one : other, { ...params, count });
}

/** Language names stay in their own language. */
export const LOCALE_OPTIONS: ReadonlyArray<{
  readonly value: LocalePreference;
  readonly label: string;
}> = [
  { value: "system", label: t("System") },
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
];
