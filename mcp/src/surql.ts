/** Escape a name for use inside backtick-delimited SurrealDB identifiers. */
export const escIdent = (name: string) => name.replace(/`/g, "``");
