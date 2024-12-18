import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { inferableAdapter, InferableGraphQLContext } from "./index";
import { approvalRequest, Inferable } from "inferable";

// Define interfaces for our data types
interface Author {
  id: string;
  name: string;
  nationality: string;
  birthYear: number;
}

interface Book {
  id: string;
  title: string;
  authorId: string;
  publishedYear: number;
  genre: string;
  rating: number;
  isAvailable: boolean;
}

// Define the GraphQL schema
const typeDefs = `#graphql
  type Book {
    id: ID!
    title: String!
    author: Author!
    publishedYear: Int
    genre: String
    rating: Float
    isAvailable: Boolean
  }

  type Author {
    id: ID!
    name: String!
    books: [Book!]!
    nationality: String
    birthYear: Int
  }

  input BookFilterInput {
    genre: String
    minRating: Float
    publishedAfter: Int
    publishedBefore: Int
    isAvailable: Boolean
  }

  input AuthorFilterInput {
    nationality: String
    bornAfter: Int
    bornBefore: Int
  }

  input PaginationInput {
    skip: Int
    limit: Int
  }

  input UpdateAuthorInput {
    id: ID!
    name: String!
  }

  enum SortOrder {
    ASC
    DESC
  }

  input BookSortInput {
    field: BookSortField!
    order: SortOrder = ASC
  }

  input AuthorSortInput {
    field: AuthorSortField!
    order: SortOrder = ASC
  }

  enum BookSortField {
    TITLE
    PUBLISHED_YEAR
    RATING
  }

  enum AuthorSortField {
    NAME
    BIRTH_YEAR
  }

  type Query {
    books(
      filter: BookFilterInput
      pagination: PaginationInput
      sort: BookSortInput
    ): [Book!]!

    book(id: ID!): Book

    authors(
      filter: AuthorFilterInput
      pagination: PaginationInput
      sort: AuthorSortInput
    ): [Author!]!

    author(id: ID!): Author
  }

  type Mutation {
    updateAuthor(input: UpdateAuthorInput!): Author
  }
`;

// Sample data with type annotations
const authors: Author[] = [
  {
    id: "1",
    name: "Kate Chopin",
    nationality: "American",
    birthYear: 1850,
  },
  {
    id: "2",
    name: "Paul Auster",
    nationality: "American",
    birthYear: 1947,
  },
];

const books: Book[] = [
  {
    id: "1",
    title: "The Awakening",
    authorId: "1",
    publishedYear: 1899,
    genre: "Novel",
    rating: 4.2,
    isAvailable: true,
  },
  {
    id: "2",
    title: "City of Glass",
    authorId: "2",
    publishedYear: 1985,
    genre: "Mystery",
    rating: 4.4,
    isAvailable: true,
  },
];

// Define resolver types
type ResolverContext = {};

// Define the Resolvers interface
interface Resolvers {
  Query: {
    books: (
      _: unknown,
      __: unknown,
      context: InferableGraphQLContext
    ) => Book[];
    book: (_: unknown, { id }: { id: string }) => Book | undefined;
    authors: () => Author[];
    author: (_: unknown, { id }: { id: string }) => Author | undefined;
  };
  Book: {
    author: (book: Book) => Author | undefined;
  };
  Author: {
    books: (author: Author) => Book[];
  };
  Mutation: {
    updateAuthor: (
      _: unknown,
      args: { input: { id: string; name: string } },
      context: InferableGraphQLContext
    ) => Author | ReturnType<typeof approvalRequest> | undefined;
  };
}

// Define resolvers with types
const resolvers: Resolvers = {
  Query: {
    books: (_, __, context) => books,
    book: (_, { id }) => books.find((book) => book.id === id),
    authors: () => authors,
    author: (_, { id }) => authors.find((author) => author.id === id),
  },
  Book: {
    author: (book) => authors.find((author) => author.id === book.authorId),
  },
  Author: {
    books: (author) => books.filter((book) => book.authorId === author.id),
  },
  Mutation: {
    updateAuthor: (_, { input }, context) => {
      const { id, name } = input;

      // TODO: Figure out how to model this in the graphql context
      // if (!context.inferable?.approved) {
      //   return approvalRequest();
      // }

      // If approval is granted, update the author
      const authorIndex = authors.findIndex((author) => author.id === id);
      if (authorIndex === -1) {
        throw new Error(`Author with ID ${id} not found`);
      }

      // Update the author while preserving other fields
      authors[authorIndex] = {
        ...authors[authorIndex],
        name,
      };

      return authors[authorIndex];
    },
  },
};

// Update the ApolloServer type
const server = new ApolloServer<InferableGraphQLContext>({
  typeDefs,
  resolvers: resolvers as any,
});

// Update the plugin section
server.addPlugin(
  inferableAdapter({
    inferableClient: new Inferable({
      endpoint: process.env.INFERABLE_URL,
      apiSecret: process.env.INFERABLE_API_SECRET,
    }),
    apolloServer: server,
  })
);

(async function main() {
  // Replace the startStandaloneServer section
  const { url } = await startStandaloneServer(server, {
    listen: { port: 4001 },
  });

  console.log(`🚀 Server ready at: ${url}`);
})();
