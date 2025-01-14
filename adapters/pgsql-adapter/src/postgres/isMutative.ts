import { Client } from "pg";

// Define the mutative keywords
const MUTATIVE_KEYWORDS = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER', 'TRUNCATE'];

const isMutativeStatic = (query: string): boolean => {
  const firstWord = query.trim().split(/\s+/)[0].toUpperCase();
  return MUTATIVE_KEYWORDS.includes(firstWord);
};

const isMutativeExplain = async (pg: Client, query: string): Promise<boolean> => {
  try {
    const result = await pg.query(`EXPLAIN ${query}`);
    return result.rows.some(row => /ModifyTable|Insert|Update|Delete/i.test(row["QUERY PLAN"]));
  } catch (error) {
    console.error('Error running EXPLAIN:', error);
    return false; // Default to non-mutative on error
  }
};

export const isMutativeQuery = async (pg: Client, query: string): Promise<boolean> => {
  // Perform static analysis
  if (isMutativeStatic(query)) return true;

  // Fallback to EXPLAIN if static analysis doesn't classify the query as mutative
  return await isMutativeExplain(pg, query);
};
