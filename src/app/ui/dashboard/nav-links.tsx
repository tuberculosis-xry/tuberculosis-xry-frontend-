'use client'

import {
    HomeIcon,
    CpuChipIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
// Map of links to display in the side navigation.
// Depending on the size of the application, this would be stored in a database.
const links = [
    {name: 'Home', href: '/dashboard', icon: HomeIcon},
    {name: 'Tuberculosis X-ray diagnostics', href: '/dashboard/tuberculosis_diagnosis', icon: CpuChipIcon},
];

export default function NavLinks() {
    const pathname = usePathname();
    return (
        <div className="bg-gray-700">
            {links.map(({name, href, icon: Icon}) => {
                const isActive = pathname === href;

                const linkClasses = `
          flex h-12 items-center justify-center gap-2 rounded-md p-3 text-sm font-medium
          bg-gray-700 text-blue-50 hover:bg-sky-100 hover:text-blue-600
          md:flex-none md:justify-start md:p-2 md:px-3
          ${isActive ? 'outline outline-2 outline-offset-2 text-blue-50 bg-gray-500' : ''}
        `;

                return (
                    <Link key={name} href={href} className={linkClasses}>
                        <Icon className="w-6"/>
                        <span className="hidden md:block">{name}</span>
                    </Link>
                );
            })}
        </div>
    );
}