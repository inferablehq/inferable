import { OrganizationList, auth } from "@clerk/nextjs";

export async function OrgList() {
  const { orgId } = await auth();

  if (orgId) {
    return null;
  }

  return (
    <section className="flex items-center justify-center h-full p-20">
      <OrganizationList
        appearance={{
          variables: {
            colorText: "black",
            colorBackground: "white",
          },
        }}
        hidePersonal={true}
      />
    </section>
  );
}
