/**
 * SurrealDB Operators
 * Reference: https://surrealdb.com/docs/surrealql/operators
 */

/**
 * Comparison operators
 */
export type ComparisonOperator =
  | "=" // Equal to
  | "!=" // Not equal to
  | "==" // Exact equality
  | "?=" // Matches a condition
  | "*=" // All match a condition
  | "~" // Contains / matches regex
  | "!~" // Does not contain / match regex
  | "?~" // Matches a condition (fuzzy)
  | "*~" // All match a condition (fuzzy)
  | "<" // Less than
  | "<=" // Less than or equal to
  | ">" // Greater than
  | ">=" // Greater than or equal to;

/**
 * Containment operators
 */
export type ContainmentOperator =
  | "CONTAINS" // Contains a value
  | "CONTAINSNOT" // Does not contain a value
  | "CONTAINSALL" // Contains all values
  | "CONTAINSANY" // Contains any value
  | "CONTAINSNONE" // Contains none of the values
  | "INSIDE" // Value is inside
  | "NOTINSIDE" // Value is not inside
  | "ALLINSIDE" // All values are inside
  | "ANYINSIDE" // Any value is inside
  | "NONEINSIDE"; // No values are inside

/**
 * String operators
 */
export type StringOperator =
  | "@@" // Matches a condition (full-text search)
  | "@0@" // Matches a condition (exact match)
  | "@1@" // Matches a condition (fuzzy match level 1)
  | "@2@" // Matches a condition (fuzzy match level 2)
  | "@3@"; // Matches a condition (fuzzy match level 3)

/**
 * Array operators
 */
export type ArrayOperator =
  | "IN" // Value is in array
  | "NOT IN"; // Value is not in array

/**
 * All available operators in SurrealDB
 */
export type Operator =
  | ComparisonOperator
  | ContainmentOperator
  | StringOperator
  | ArrayOperator;

/**
 * Common operators for basic queries
 */
export type BasicOperator = "=" | "!=" | "<" | "<=" | ">" | ">=" | "CONTAINS" | "IN";
