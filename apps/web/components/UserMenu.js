"use client";

import { signOut } from "next-auth/react";

export default function UserMenu({ email }) {
  if (!email) return null;
  return (
    <div className="user-menu">
      <span className="user-menu-email" title={email}>
        {email}
      </span>
      <button className="user-menu-signout" onClick={() => signOut({ redirectTo: "/signin" })}>
        Sign out
      </button>
    </div>
  );
}
