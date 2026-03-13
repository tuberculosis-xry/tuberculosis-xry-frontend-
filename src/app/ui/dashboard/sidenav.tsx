// app/ui/dashboard/SideNav.jsx or SideNav.tsx

import Link from 'next/link';
import NavLinks from '@/app/ui/dashboard/nav-links';
import SignOutButton from '@/app/ui/dashboard/SignOutButton'; // Adjust the import path as necessary
import { inter } from "@/app/ui/fonts";

export default function SideNav() {
    return (
        <div className="flex h-full flex-col px-3 py-4 md:px-2 bg-gray-700">
            <Link
                className="mb-2 flex flex-col items-center h-20 justify-center rounded-md bg-gray-700 p-4 md:h-40"
                href="/"
            >
                <p className={`${inter.className}`}>AImpact Diagnostics</p>
            </Link>
            <div className="flex grow flex-row justify-between space-x-2 md:flex-col md:space-x-0 md:space-y-2 bg-gray-700">
                <NavLinks />
                <div className="hidden h-auto w-full grow rounded-md bg-gray-700 md:block"></div>
                <SignOutButton /> {/* Client Component */}
            </div>
        </div>
    );
}
