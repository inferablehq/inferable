/*
 * This file contains the GraphQL parser for the data connector.
 * It is used to parse the GraphQL query and convert it into a format that can be used by the data connector.
 * "We don't need to be accurate, just good enough for the LLM to understand WTF is going on"
 */

import gql from "graphql-tag";

interface SchemaType {
  name: string;
  description?: string;
  fields?: Field[];
  values?: EnumValue[];
  inputFields?: InputField[];
}

interface Field {
  name: string;
  description?: string;
  arguments?: Argument[];
  type: string;
}

interface Argument {
  name: string;
  description?: string;
  type: string;
  defaultValue?: string;
}

interface EnumValue {
  name: string;
  description?: string;
}

interface InputField {
  name: string;
  description?: string;
  type: string;
  defaultValue?: string;
}

export class GraphQLSchemaParser {
  private schema: string;

  constructor(schema: string) {
    this.schema = schema;
  }

  private extractDescription(block: string): string | undefined {
    const descMatch = block.match(/"""([^"]*)"""/);
    return descMatch ? descMatch[1].trim() : undefined;
  }

  private parseArguments(argsString: string): Argument[] {
    const args: Argument[] = [];
    const argPattern = /(\w+):\s*([^!\s]+!?\]?!?)(?:\s*=\s*([^\s,)]+))?/g;
    let match;

    while ((match = argPattern.exec(argsString)) !== null) {
      args.push({
        name: match[1],
        type: match[2],
        defaultValue: match[3],
      });
    }

    return args;
  }

  private parseFields(block: string): Field[] {
    const fields: Field[] = [];
    const fieldPattern =
      /"""([^"]*)"""|\b(\w+)(?:\(([^)]+)\))?:\s*([\w\[\]!]+)/g;
    let match;
    let currentDescription: string | undefined;

    while ((match = fieldPattern.exec(block)) !== null) {
      if (match[1]) {
        currentDescription = match[1].trim();
      } else {
        fields.push({
          name: match[2],
          description: currentDescription,
          arguments: match[3] ? this.parseArguments(match[3]) : undefined,
          type: match[4],
        });
        currentDescription = undefined;
      }
    }

    return fields;
  }

  private parseEnumValues(block: string): EnumValue[] {
    const values: EnumValue[] = [];
    const valuePattern = /"""([^"]*)"""\s*(\w+)|^\s*(\w+)$/gm;
    let match;
    let currentDescription: string | undefined;

    while ((match = valuePattern.exec(block)) !== null) {
      if (match[1]) {
        currentDescription = match[1].trim();
      } else {
        values.push({
          name: match[2] || match[3],
          description: currentDescription,
        });
        currentDescription = undefined;
      }
    }

    return values;
  }

  private parseInputFields(block: string): InputField[] {
    const fields: InputField[] = [];
    const fieldPattern =
      /"""([^"]*)"""|\b(\w+):\s*([\w\[\]!]+)(?:\s*=\s*([^\s,]+))?/g;
    let match;
    let currentDescription: string | undefined;

    while ((match = fieldPattern.exec(block)) !== null) {
      if (match[1]) {
        currentDescription = match[1].trim();
      } else {
        fields.push({
          name: match[2],
          type: match[3],
          description: currentDescription,
          defaultValue: match[4],
        });
        currentDescription = undefined;
      }
    }

    return fields;
  }

  public parseTypes(): SchemaType[] {
    const types: SchemaType[] = [];
    const typePattern =
      /(?:type|input|enum|union|interface)\s+(\w+)[^{]*{([^}]*)}/g;
    let match;

    while ((match = typePattern.exec(this.schema)) !== null) {
      const [fullMatch, name, body] = match;
      const description = this.extractDescription(
        this.schema.substring(Math.max(0, match.index - 200), match.index),
      );

      const type: SchemaType = { name, description };

      if (fullMatch.startsWith("enum")) {
        type.values = this.parseEnumValues(body);
      } else if (fullMatch.startsWith("input")) {
        type.inputFields = this.parseInputFields(body);
      } else if (!fullMatch.startsWith("union")) {
        type.fields = this.parseFields(body);
      }

      types.push(type);
    }

    return types;
  }

  public parseQueries(): Field[] {
    const queryType = this.schema.match(/type\s+Query[^{]*{([^}]*)}/s);
    return queryType ? this.parseFields(queryType[1]) : [];
  }

  public parseMutations(): Field[] {
    const mutationType = this.schema.match(/type\s+Mutation[^{]*{([^}]*)}/s);
    return mutationType ? this.parseFields(mutationType[1]) : [];
  }
}
