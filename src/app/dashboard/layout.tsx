'use client';

import { useAuth } from "@/contexts/AuthContext";
import { usePathname } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import ModeToggle from "@/app/components/themeToggle";
import {
    Home,
    Stethoscope,
    Settings,
    LogOut,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    Activity,
    Menu,
    X,
    User,
    ScanLine,
} from "lucide-react";

const navLinks: { title: string; href: string; icon: typeof Home }[] = [
    { title: "Dashboard", href: "/dashboard", icon: Home },
    { title: "OHIF", href: "/dashboard/ohif", icon: ScanLine },
    { title: "Settings", href: "/dashboard/settings", icon: Settings },
];

const diagnosisChildren = [
    { title: "TB Diagnosis", href: "/dashboard/tuberculosis_diagnosis" },
    // Add more diagnosis types here later, e.g. { title: "Other Diagnosis", href: "/dashboard/other_diagnosis" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { user, loading, logout } = useAuth();
    const pathname = usePathname();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [diagnosisOpen, setDiagnosisOpen] = useState(true);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 rounded-full border-3 border-primary border-t-transparent animate-spin" />
                    <span className="text-muted-foreground text-sm">Loading dashboard...</span>
                </div>
            </div>
        );
    }

    if (!user) return null;

    const isViewerRoute = pathname?.startsWith('/dashboard/ohif/viewer');
    if (isViewerRoute) {
        return <div className="min-h-screen flex flex-col bg-background">{children}</div>;
    }

    const userInitials = user.displayName
        ? user.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
        : user.email?.slice(0, 2).toUpperCase() || 'U';

    return (
        <div className="min-h-screen flex">
            {/* ─── Mobile Sidebar Overlay ─── */}
            {mobileOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden animate-fade-in"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            {/* ═══════════════ Sidebar ═══════════════ */}
            <aside
                className={`
          fixed lg:sticky top-0 left-0 h-screen z-50 flex flex-col transition-all duration-300 ease-in-out
          glass-sidebar
          ${sidebarOpen ? 'w-64' : 'w-20'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
            >
                {/* Logo Area */}
                <div className={`flex items-center py-5 border-b border-border/50 ${sidebarOpen ? 'justify-between px-5' : 'justify-center'}`}>
                    <Link href="/dashboard" className="flex items-center gap-3 shrink-0">
                        <div className="relative w-9 h-9 rounded-xl overflow-hidden shadow-lg shadow-primary/10">
                            <Image src="/tb_dalle.webp" alt="AImpact" fill className="object-cover" />
                        </div>
                        {sidebarOpen && (
                            <span className="font-display font-bold text-base whitespace-nowrap animate-in fade-in slide-in-from-left-2 duration-300">
                                <span className="gradient-text">AI</span>mpact
                            </span>
                        )}
                    </Link>

                    {sidebarOpen && (
                        <button
                            onClick={() => setSidebarOpen(false)}
                            className="hidden lg:flex h-7 w-7 items-center justify-center rounded-lg hover:bg-secondary/50 transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                    )}
                    <button
                        onClick={() => setMobileOpen(false)}
                        className="lg:hidden h-7 w-7 flex items-center justify-center rounded-lg hover:bg-secondary/50 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Floating toggle button when collapsed */}
                {!sidebarOpen && (
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="absolute -right-3 top-16 h-6 w-6 hidden lg:flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg border border-primary/20 z-50 hover:scale-110 transition-transform hover:bg-primary/90"
                    >
                        <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                )}

                {/* Navigation */}
                <nav className="flex-1 py-4 px-3 space-y-1">
                    {/* Dashboard */}
                    {navLinks.filter((item) => item.href === "/dashboard").map((item) => {
                        const Icon = item.icon;
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200
                  ${isActive ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'hover:bg-primary/10 hover:text-primary'}
                  group
                  ${sidebarOpen ? '' : 'justify-center'}
                `}
                                onClick={() => setMobileOpen(false)}
                            >
                                <Icon className={`w-5 h-5 shrink-0 transition-transform ${isActive ? '' : 'group-hover:scale-110'}`} />
                                {sidebarOpen && (
                                    <span className="text-sm font-medium whitespace-nowrap">{item.title}</span>
                                )}
                            </Link>
                        );
                    })}

                    {/* Diagnosis (dropdown) */}
                    {sidebarOpen ? (
                        <div className="space-y-0.5">
                            <button
                                type="button"
                                onClick={() => setDiagnosisOpen((o) => !o)}
                                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200
                  ${diagnosisChildren.some((c) => pathname === c.href) ? 'bg-primary/10 text-primary' : 'hover:bg-primary/10 hover:text-primary'}
                  group
                `}
                            >
                                <Stethoscope className="w-5 h-5 shrink-0 transition-transform group-hover:scale-110" />
                                <span className="text-sm font-medium whitespace-nowrap flex-1 text-left">Diagnosis</span>
                                <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${diagnosisOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {diagnosisOpen && (
                                <div className="pl-4 ml-2 border-l border-border/60 space-y-0.5">
                                    {diagnosisChildren.map((child) => {
                                        const isActive = pathname === child.href;
                                        return (
                                            <Link
                                                key={child.href}
                                                href={child.href}
                                                className={`
                                    flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 text-sm
                                    ${isActive ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20' : 'hover:bg-muted/80 text-muted-foreground hover:text-foreground'}
                                  `}
                                                onClick={() => setMobileOpen(false)}
                                            >
                                                <span className="font-medium whitespace-nowrap">{child.title}</span>
                                            </Link>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ) : (
                        <Link
                            href={diagnosisChildren[0]?.href ?? "/dashboard/tuberculosis_diagnosis"}
                            className="flex items-center justify-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 hover:bg-primary/10 hover:text-primary group"
                            onClick={() => setMobileOpen(false)}
                        >
                            <Stethoscope className="w-5 h-5 shrink-0 transition-transform group-hover:scale-110" />
                        </Link>
                    )}

                    {/* OHIF, Settings */}
                    {navLinks.filter((item) => item.href !== "/dashboard").map((item) => {
                        const Icon = item.icon;
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200
                  ${isActive ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'hover:bg-primary/10 hover:text-primary'}
                  group
                  ${sidebarOpen ? '' : 'justify-center'}
                `}
                                onClick={() => setMobileOpen(false)}
                            >
                                <Icon className={`w-5 h-5 shrink-0 transition-transform ${isActive ? '' : 'group-hover:scale-110'}`} />
                                {sidebarOpen && (
                                    <span className="text-sm font-medium whitespace-nowrap">{item.title}</span>
                                )}
                            </Link>
                        );
                    })}
                </nav>

                {/* User Section */}
                <div className="border-t border-border/50 px-3 py-4">
                    {/* User Info */}
                    <div className={`flex items-center gap-3 px-3 py-2 mb-2 ${sidebarOpen ? '' : 'justify-center'}`}>
                        <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                            {user.photoURL ? (
                                <Image src={user.photoURL} alt="Avatar" width={36} height={36} className="rounded-full" />
                            ) : (
                                <span className="text-xs font-bold text-primary">{userInitials}</span>
                            )}
                        </div>
                        {sidebarOpen && (
                            <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{user.displayName || 'User'}</p>
                                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                            </div>
                        )}
                    </div>

                    {/* Sign Out */}
                    <button
                        onClick={logout}
                        className={`
              flex items-center gap-3 w-full px-3 py-2.5 rounded-xl transition-all duration-200
              hover:bg-destructive/10 hover:text-destructive text-muted-foreground
              ${sidebarOpen ? '' : 'justify-center'}
            `}
                    >
                        <LogOut className="w-5 h-5 shrink-0" />
                        {sidebarOpen && <span className="text-sm font-medium">Sign Out</span>}
                    </button>
                </div>
            </aside>

            {/* ═══════════════ Main Content ═══════════════ */}
            <div className="flex-1 flex flex-col min-h-screen">
                {/* Top Header */}
                <header className="sticky top-0 z-30 glass-nav px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setMobileOpen(true)}
                            className="lg:hidden h-9 w-9 flex items-center justify-center rounded-xl hover:bg-secondary/50 transition-colors"
                        >
                            <Menu className="w-5 h-5" />
                        </button>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Activity className="w-4 h-4 text-green-500" />
                            <span className="hidden sm:inline">System Online</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <ModeToggle />
                        <div className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center">
                            {user.photoURL ? (
                                <Image src={user.photoURL} alt="Avatar" width={36} height={36} className="rounded-full" />
                            ) : (
                                <User className="w-4 h-4 text-primary" />
                            )}
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <main className="flex-1 p-6 lg:p-8">
                    {children}
                </main>
            </div>
        </div>
    );
}
