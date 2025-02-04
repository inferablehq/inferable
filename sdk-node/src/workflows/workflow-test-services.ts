import { z } from "zod";
import { Inferable } from "../Inferable";

export const createServices = async (inferable: Inferable): Promise<void> => {
  const fakeLoans = [
    {
      id: "loan-123",
      customerId: "customerId-123",
      amount: 1000,
      status: "active",
      assetClasses: ["123", "456"],
    },
    {
      id: "loan-124",
      customerId: "customerId-123",
      amount: 2000,
      status: "active",
      assetClasses: ["456", "789"],
    },
    {
      id: "loan-125",
      customerId: "customerId-123",
      amount: 3000,
      status: "active",
      assetClasses: ["123", "789"],
    },
  ];

  inferable.tools.register({
    name: "getLoansForCustomer",
    schema: {
      input: z.object({
        customerId: z.string(),
      }),
    },
    func: async ({ customerId }) => {
      console.log("getLoansForCustomer:request", { customerId });

      const loans = fakeLoans
        .filter((loan) => loan.customerId === customerId)
        .map((loan) => ({
          id: loan.id,
        }));

      console.log("getLoansForCustomer:response", { loans });

      return loans;
    },
  });

  inferable.tools.register({
    name: "getLoanDetails",
    schema: {
      input: z.object({
        loanId: z.string(),
      }),
    },
    func: async ({ loanId }) => {
      console.log("getLoanDetails:request", { loanId });
      const loan = fakeLoans.find((loan) => loan.id === loanId);
      console.log("getLoanDetails:response", { loan });
      return loan;
    },
  });

  inferable.tools.register({
    name: "getAssetClassDetails",
    schema: {
      input: z.object({
        assetClassId: z.string(),
      }),
    },
    func: async ({ assetClassId }) => {
      console.log("getAssetClassDetails:request", { assetClassId });
      if (assetClassId === "123") {
        return {
          name: "property",
          risk: "low",
        };
      }

      if (assetClassId === "456") {
        return {
          name: "government-bonds",
          risk: "very low",
        };
      }

      if (assetClassId === "789") {
        return {
          name: "meme-coins",
          risk: "high",
        };
      }
    },
  });

  await inferable.tools.listen();
};
