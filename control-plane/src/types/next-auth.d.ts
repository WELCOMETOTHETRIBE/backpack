import "next-auth";

declare module "next-auth" {
  interface User {
    id?: string;
    organizationId?: string;
    role?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    organizationId?: string;
    role?: string;
  }
}
