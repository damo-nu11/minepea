import type { Metadata } from "next";
import { ProfilePage } from "@/components/profile/ProfilePage";

export const metadata: Metadata = {
  title: "Profile | PEA",
  description: "Your PEA identity, holdings, and mining record.",
};

export default function Profile() {
  return <ProfilePage />;
}
