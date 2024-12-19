import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { inferableAdapter, InferableGraphQLContext } from "../index";
import { approvalRequest, Inferable } from "inferable";
import path from "path";
import fs from "fs";

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
const typeDefs = fs.readFileSync(path.join(__dirname, "github.gql"), "utf8");

// Define resolvers with types
const resolvers = {
  Query: new Proxy(
    {},
    {
      get: (target, prop) => {
        console.log("Query", prop);
        return target[prop];
      },
    }
  ),
  Mutation: new Proxy(
    {},
    {
      get: (target, prop) => {
        console.log("Mutation", prop);
        return target[prop];
      },
    }
  ),
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
