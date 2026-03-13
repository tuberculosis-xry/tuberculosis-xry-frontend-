'use client';

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import ModeToggle from "@/app/components/themeToggle";
import { useAuth } from "@/contexts/AuthContext";
import {
    Brain,
    ChevronRight,
    ArrowRight,
    Shield,
    Zap,
    Stethoscope,
    Ruler,
    FileSearch,
    Share2,
    ImageIcon,
} from "lucide-react";

/* ─── Feature card: premium classic ─── */
function FeatureCard({
    icon: Icon,
    title,
    description,
}: {
    icon: React.ElementType;
    title: string;
    description: string;
}) {
    return (
        <div className="group p-8 rounded-xl border border-border/80 bg-card shadow-sm transition-all duration-300 hover:shadow-md hover:border-border">
            <div className="w-12 h-12 rounded-lg bg-muted/80 flex items-center justify-center mb-5 text-muted-foreground group-hover:text-foreground transition-colors">
                <Icon className="w-6 h-6" strokeWidth={1.5} />
            </div>
            <h3 className="font-semibold text-lg text-foreground mb-2 tracking-tight">{title}</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
                {description}
            </p>
        </div>
    );
}

/* ─── Capability pill: minimal ─── */
function CapabilityPill({ label }: { label: string }) {
    return (
        <span className="inline-block px-4 py-2 rounded-md bg-muted/60 text-sm text-foreground/90 border border-border/60">
            {label}
        </span>
    );
}

/* ═══════════════════════════════════════════════════════════════
   Landing Page – Premium classic design
   ═══════════════════════════════════════════════════════════════ */
export default function Home() {
    useAuth();
    const [scrollY, setScrollY] = useState(0);

    useEffect(() => {
        const handleScroll = () => setScrollY(window.scrollY);
        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    return (
        <div className="min-h-screen bg-background antialiased">
            {/* Subtle top gradient (no orbs) */}
            <div className="fixed inset-0 pointer-events-none -z-10 bg-gradient-to-b from-muted/30 via-transparent to-transparent h-[70vh]" />

            {/* ═══════════════ Navbar ═══════════════ */}
            <nav
                className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
                    scrollY > 20
                        ? "bg-background/95 border-b border-border/80 backdrop-blur-sm shadow-sm"
                        : "bg-transparent"
                }`}
            >
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
                    <Link
                        href="/"
                        className="flex items-center gap-2.5 group transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
                    >
                        <div className="relative w-9 h-9 rounded-lg overflow-hidden ring-1 ring-border/60 transition-all duration-200 group-hover:ring-foreground/30">
                            <Image
                                src="/tb_dalle.webp"
                                alt="AImpact"
                                fill
                                className="object-cover transition-transform duration-200 group-hover:scale-105"
                            />
                        </div>
                        <span className="font-semibold text-foreground text-lg tracking-tight">
                            A<span className="text-primary">I</span>mpact
                        </span>
                    </Link>
                    <div className="flex items-center gap-2">
                        <ModeToggle />
                        <Link
                            href="/login"
                            className="text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/70 px-4 py-2 rounded-lg transition-all duration-200 ease-out hidden sm:inline-block hover:scale-[1.02] active:scale-[0.98]"
                        >
                            Log in
                        </Link>
                        <Link
                            href="/login"
                            className="group text-sm font-medium bg-foreground text-background px-4 py-2 rounded-lg inline-flex items-center gap-1 transition-all duration-200 ease-out hover:scale-[1.03] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-foreground/25 active:scale-[0.98] active:translate-y-0"
                        >
                            Create account
                            <ChevronRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                        </Link>
                    </div>
                </div>
            </nav>

            {/* ═══════════════ Hero ═══════════════ */}
            <section className="pt-36 pb-24 md:pt-44 md:pb-32 px-6">
                <div className="max-w-6xl mx-auto flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
                    <div className="flex-1 max-w-2xl lg:max-w-none">
                        <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-6">
                            Medical diagnostics
                        </p>
                        <h1 className="font-semibold text-4xl md:text-5xl lg:text-6xl text-foreground leading-[1.12] tracking-tight mb-6">
                            Tuberculosis screening and DICOM viewing, in one place.
                        </h1>
                        <p className="text-lg text-muted-foreground leading-relaxed mb-10">
                            AImpact combines AI-powered chest X-ray TB screening (DenseNet121 ONNX, optional TTA)
                            with an integrated DICOM viewer: worklist, measurements, prior comparison, and export.
                        </p>
                        <div className="flex flex-wrap gap-3">
                            <Link
                                href="/login"
                                className="group inline-flex items-center gap-2 bg-foreground text-background font-medium px-6 py-3 rounded-lg transition-all duration-200 ease-out hover:scale-[1.03] hover:-translate-y-0.5 hover:shadow-xl hover:shadow-foreground/20 active:scale-[0.98] active:translate-y-0"
                            >
                                Get started
                                <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                            </Link>
                            <Link
                                href="/login"
                                className="inline-flex items-center gap-2 font-medium px-6 py-3 rounded-lg border border-border text-foreground transition-all duration-200 ease-out hover:scale-[1.03] hover:-translate-y-0.5 hover:bg-muted/60 hover:border-foreground/30 hover:shadow-md active:scale-[0.98] active:translate-y-0"
                            >
                                Sign in
                            </Link>
                        </div>
                    </div>
                    <div className="flex-1 w-full max-w-xl lg:max-w-none flex justify-center lg:justify-end">
                        <div className="relative w-full max-w-md aspect-[4/3] rounded-2xl overflow-hidden border border-border/80 shadow-xl bg-card">
                            <Image
                                src="/tb_dalle.webp"
                                alt="AImpact"
                                fill
                                className="object-cover"
                                priority
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══════════════ Section: Tuberculosis + DICOM Viewer (redesigned) ═══════════════ */}
            <section className="py-20 px-6 border-t border-border/60">
                <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Tuberculosis screening card */}
                    <div className="group relative flex flex-col rounded-2xl border border-border/80 bg-card p-8 shadow-sm overflow-hidden transition-all duration-300 hover:shadow-lg hover:border-primary/20">
                        <div className="absolute top-0 left-0 w-1 h-full bg-primary/60 opacity-80 group-hover:opacity-100 transition-opacity" />
                        <div className="pl-4">
                            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-5 text-primary">
                                <Stethoscope className="w-5 h-5" strokeWidth={1.5} />
                            </div>
                            <h2 className="font-semibold text-xl md:text-2xl text-foreground tracking-tight mb-3">
                                Tuberculosis screening
                            </h2>
                            <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                                Upload a chest X-ray for a class (normal / tuberculosis) and a confidence score.
                                DenseNet121 ONNX with optional Test-Time Augmentation. Scan history and filters in the dashboard.
                            </p>
                            <Link
                                href="/login"
                                className="group/btn inline-flex items-center gap-2 w-fit font-medium text-foreground border border-border px-5 py-2.5 rounded-lg transition-all duration-200 ease-out hover:scale-[1.04] hover:-translate-y-0.5 hover:bg-muted/60 hover:border-foreground/30 hover:shadow-md active:scale-[0.98] active:translate-y-0"
                            >
                                Try TB screening
                                <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover/btn:translate-x-1" />
                            </Link>
                        </div>
                    </div>

                    {/* DICOM viewer card */}
                    <div className="group relative flex flex-col rounded-2xl border border-border/80 bg-card p-8 shadow-sm overflow-hidden transition-all duration-300 hover:shadow-lg hover:border-primary/20">
                        <div className="absolute top-0 left-0 w-1 h-full bg-primary/40 opacity-80 group-hover:opacity-100 transition-opacity" />
                        <div className="pl-4">
                            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-5 text-primary">
                                <ImageIcon className="w-5 h-5" strokeWidth={1.5} />
                            </div>
                            <h2 className="font-semibold text-xl md:text-2xl text-foreground tracking-tight mb-3">
                                DICOM viewer
                            </h2>
                            <p className="text-muted-foreground text-sm leading-relaxed">
                                Worklist and study list with search and filter. Load DICOM via DICOMweb or upload.
                                Window/level, zoom, pan, layouts 1x1, 1x2, 2x2. On-canvas measurements (length, angle, ROI area from pixel spacing).
                                Annotations, prior study comparison, draft state, export CSV/SR, print report, STOW. Deep link from external worklist.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══════════════ Features ═══════════════ */}
            <section className="py-24 px-6 bg-muted/20 border-t border-border/60">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-14">
                        <h2 className="font-semibold text-2xl md:text-3xl text-foreground tracking-tight mb-3">
                            What you get
                        </h2>
                        <p className="text-muted-foreground">
                            Real features in this application
                        </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <FeatureCard
                            icon={Brain}
                            title="DenseNet121 (ONNX)"
                            description="Chest X-ray TB classification. Optional Test-Time Augmentation with configurable passes."
                        />
                        <FeatureCard
                            icon={Shield}
                            title="Confidence and class"
                            description="Each scan returns a class and confidence score. Scan history with filters in the dashboard."
                        />
                        <FeatureCard
                            icon={Zap}
                            title="TB workflow"
                            description="Upload X-ray, run inference, view result. JPEG, PNG and other formats supported."
                        />
                        <FeatureCard
                            icon={Stethoscope}
                            title="Clinical context"
                            description="Patient and study identification, scan history, and result filtering."
                        />
                        <FeatureCard
                            icon={FileSearch}
                            title="Worklist and search"
                            description="Patient and study list with search and filter by name, MRN, sex, date, modality, accession."
                        />
                        <FeatureCard
                            icon={ImageIcon}
                            title="DICOM viewing"
                            description="Load via DICOMweb or upload. Window/level, zoom, pan, fit/reset. Series and frame navigation, thumbnails."
                        />
                        <FeatureCard
                            icon={Ruler}
                            title="On-canvas measurements"
                            description="Length (mm), angle (degrees), rectangle and ellipse ROI area (mm²). Export CSV/SR, print, STOW."
                        />
                        <FeatureCard
                            icon={Share2}
                            title="Prior comparison and export"
                            description="Compare with prior study. Draft reading state. Deep link from external worklist. Annotations persisted."
                        />
                    </div>
                </div>
            </section>

            {/* ═══════════════ Capabilities ═══════════════ */}
            <section className="py-20 px-6">
                <div className="max-w-4xl mx-auto">
                    <h2 className="font-semibold text-xl text-muted-foreground text-center mb-8 tracking-tight">
                        Capabilities
                    </h2>
                    <div className="flex flex-wrap justify-center gap-3">
                        <CapabilityPill label="DenseNet121 (ONNX)" />
                        <CapabilityPill label="Configurable TTA" />
                        <CapabilityPill label="Confidence per scan" />
                        <CapabilityPill label="DICOM + upload" />
                        <CapabilityPill label="Length, angle, ROI" />
                        <CapabilityPill label="Prior comparison" />
                        <CapabilityPill label="Export, print, STOW" />
                        <CapabilityPill label="Launch deep link" />
                    </div>
                </div>
            </section>

            {/* ═══════════════ CTA ═══════════════ */}
            <section className="py-24 px-6 border-t border-border/60">
                <div className="max-w-2xl mx-auto text-center">
                    <h2 className="font-semibold text-2xl md:text-3xl text-foreground tracking-tight mb-4">
                        Get started
                    </h2>
                    <p className="text-muted-foreground mb-10">
                        Sign in or create an account to access the dashboard.
                    </p>
                    <div className="flex flex-wrap gap-3 justify-center">
                        <Link
                            href="/login"
                            className="group inline-flex items-center gap-2 bg-foreground text-background font-medium px-8 py-3 rounded-lg transition-all duration-200 ease-out hover:scale-[1.04] hover:-translate-y-0.5 hover:shadow-xl hover:shadow-foreground/20 active:scale-[0.98] active:translate-y-0"
                        >
                            Create account
                            <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                        </Link>
                        <Link
                            href="/login"
                            className="inline-flex items-center font-medium px-8 py-3 rounded-lg border border-border text-foreground transition-all duration-200 ease-out hover:scale-[1.04] hover:-translate-y-0.5 hover:bg-muted/60 hover:border-foreground/30 hover:shadow-md active:scale-[0.98] active:translate-y-0"
                        >
                            Sign in
                        </Link>
                    </div>
                </div>
            </section>

            {/* ═══════════════ Footer ═══════════════ */}
            <footer className="border-t border-border/80 py-10 px-6">
                <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <Image src="/tb_dalle.webp" alt="" width={28} height={28} className="rounded-md" />
                        <span className="font-semibold text-foreground text-sm">
                            A<span className="text-primary">I</span>mpact
                        </span>
                    </div>
                    <div className="flex items-center gap-6 text-sm text-muted-foreground">
                        <Link
                            href="/login"
                            className="hover:text-foreground transition-all duration-200 hover:underline hover:underline-offset-4 hover:scale-[1.05]"
                        >
                            Log in
                        </Link>
                        <Link
                            href="/login"
                            className="hover:text-foreground transition-all duration-200 hover:underline hover:underline-offset-4 hover:scale-[1.05]"
                        >
                            Create account
                        </Link>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        © {new Date().getFullYear()} AImpact
                    </p>
                </div>
            </footer>
        </div>
    );
}
