'use client';

import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import Image from 'next/image';
import {
    Stethoscope,
    ArrowRight,
    Activity,
    Shield,
    CheckCircle2,
    XCircle,
    Clock,
    TrendingUp,
    User,
    Mail,
    AlertTriangle,
    Loader2,
} from 'lucide-react';
import { useCachedStats, useCachedScans, type ScanItem } from '@/hooks/useCachedApi';

/* ─── Stat Card ─── */
function StatCard({
    icon: Icon,
    label,
    value,
    color,
    delay,
}: {
    icon: React.ElementType;
    label: string;
    value: string;
    color: string;
    delay: string;
}) {
    return (
        <div className={`stat-card animate-slide-up opacity-0 ${delay}`}>
            <div className="flex items-center justify-between mb-4">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
                    <Icon className="w-5 h-5" />
                </div>
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="font-display text-2xl font-bold mb-1">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
        </div>
    );
}

export default function DashboardHome() {
    const { user } = useAuth();
    const { stats, loading: statsLoading } = useCachedStats(user?.uid);
    const { scans: recentScansRaw, loading: recentLoading } = useCachedScans(user?.uid, { limit: 5 });
    const recentScans: ScanItem[] = recentScansRaw.slice(0, 5);

    const firstName = user?.displayName?.split(' ')[0] || 'Doctor';

    return (
        <div className="max-w-6xl mx-auto space-y-8">
            {/* ─── Welcome Banner ─── */}
            <div className="glass-card rounded-2xl p-8 animate-slide-up relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-primary/5 -translate-y-1/2 translate-x-1/2 blur-3xl" />
                <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-success/10 text-success text-xs font-semibold mb-4">
                            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                            All Systems Operational
                        </div>
                        <h1 className="font-display text-3xl md:text-4xl font-bold mb-2">
                            Welcome back, <span className="gradient-text">{firstName}</span>
                        </h1>
                        <p className="text-muted-foreground text-lg max-w-xl">
                            Your AI diagnostic workspace is ready. Upload X-rays for instant TB analysis.
                        </p>
                    </div>
                    <Link
                        href="/dashboard/tuberculosis_diagnosis"
                        className="btn-premium inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold shrink-0 hover:opacity-90 transition-opacity"
                    >
                        Let&apos;s upload
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            </div>

            {/* ─── Stats Grid (live from MongoDB) ─── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    icon={Activity}
                    label="Total Scans"
                    value={statsLoading ? '…' : String(stats.totalScans)}
                    color="bg-primary/10 text-primary"
                    delay="delay-100"
                />
                <StatCard
                    icon={XCircle}
                    label="TB Detected"
                    value={statsLoading ? '…' : String(stats.tbDetected)}
                    color="bg-destructive/10 text-destructive"
                    delay="delay-200"
                />
                <StatCard
                    icon={CheckCircle2}
                    label="Normal Results"
                    value={statsLoading ? '…' : String(stats.normalResults)}
                    color="bg-success/10 text-success"
                    delay="delay-300"
                />
                <StatCard
                    icon={Shield}
                    label="Avg Confidence"
                    value={statsLoading ? '…' : (stats.avgConfidence != null ? `${stats.avgConfidence.toFixed(1)}%` : '—')}
                    color="bg-accent/10 text-accent-foreground"
                    delay="delay-400"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* ─── Quick Actions ─── */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Quick Action Card */}
                    <div className="glass-card rounded-2xl p-6 animate-slide-up opacity-0 delay-300">
                        <h2 className="font-display text-xl font-bold mb-4">Quick Actions</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Link
                                href="/dashboard/tuberculosis_diagnosis"
                                className="flex items-center gap-4 p-4 rounded-xl border border-border/50 hover:border-primary/30 hover:bg-primary/5 transition-all duration-300 group"
                            >
                                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                                    <Stethoscope className="w-6 h-6 text-primary" />
                                </div>
                                <div className="flex-1">
                                    <p className="font-semibold text-sm">New TB Scan</p>
                                    <p className="text-xs text-muted-foreground">Upload and analyze X-ray</p>
                                </div>
                                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                            </Link>

                            <Link
                                href="/dashboard/settings"
                                className="flex items-center gap-4 p-4 rounded-xl border border-border/50 hover:border-primary/30 hover:bg-primary/5 transition-all duration-300 group"
                            >
                                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                                    <Clock className="w-6 h-6 text-accent-foreground" />
                                </div>
                                <div className="flex-1">
                                    <p className="font-semibold text-sm">Settings</p>
                                    <p className="text-xs text-muted-foreground">Theme & account settings</p>
                                </div>
                                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                            </Link>
                        </div>
                    </div>

                    {/* Recent Activity (live from MongoDB) */}
                    <div className="glass-card rounded-2xl p-6 animate-slide-up opacity-0 delay-400">
                        <h2 className="font-display text-xl font-bold mb-4">Recent Activity</h2>
                        {recentLoading ? (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
                                <p className="text-sm text-muted-foreground">Loading recent scans...</p>
                            </div>
                        ) : recentScans.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                                    <Stethoscope className="w-7 h-7 text-muted-foreground" />
                                </div>
                                <p className="font-medium mb-1">No scans yet</p>
                                <p className="text-sm text-muted-foreground mb-4">
                                    Start by uploading a chest X-ray for analysis
                                </p>
                                <Link
                                    href="/dashboard/tuberculosis_diagnosis"
                                    className="btn-premium text-sm px-6 py-2.5 rounded-xl text-primary-foreground inline-flex items-center gap-2"
                                >
                                    Upload X-ray
                                    <ArrowRight className="w-4 h-4" />
                                </Link>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {recentScans.map((scan) => (
                                    <Link
                                        key={scan.id}
                                        href="/dashboard/tuberculosis_diagnosis"
                                        className="flex items-center gap-3 p-3 rounded-xl border border-border/50 hover:border-primary/30 hover:bg-primary/5 transition-all duration-200"
                                    >
                                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${scan.result === 'tuberculosis' ? 'bg-destructive/10' : 'bg-success/10'}`}>
                                            {scan.result === 'tuberculosis' ? (
                                                <AlertTriangle className="w-4 h-4 text-destructive" />
                                            ) : (
                                                <CheckCircle2 className="w-4 h-4 text-success" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-sm truncate">{scan.patientName}</p>
                                            {(scan.patientSex || scan.patientBirthDate) && (
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    {[
                                                        scan.patientBirthDate && (() => {
                                                            try {
                                                                const by = parseInt(scan.patientBirthDate!.slice(0, 4), 10);
                                                                const ref = new Date().getFullYear();
                                                                const age = ref - by;
                                                                return age >= 0 ? `${age} yrs` : null;
                                                            } catch { return null; }
                                                        })(),
                                                        scan.patientSex && (scan.patientSex === 'M' ? 'Male' : scan.patientSex === 'F' ? 'Female' : scan.patientSex === 'O' ? 'Other' : scan.patientSex),
                                                    ].filter(Boolean).join(' · ')}
                                                </p>
                                            )}
                                            <p className="text-xs text-muted-foreground">
                                                {new Date(scan.timestamp).toLocaleString()} · {scan.confidence.toFixed(0)}% confidence
                                            </p>
                                        </div>
                                        <span className={`text-xs font-semibold capitalize px-2 py-0.5 rounded-full shrink-0 ${scan.result === 'tuberculosis' ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'}`}>
                                            {scan.result}
                                        </span>
                                    </Link>
                                ))}
                                <Link
                                    href="/dashboard/tuberculosis_diagnosis"
                                    className="block text-center text-sm font-medium text-primary hover:underline pt-2"
                                >
                                    View all scans →
                                </Link>
                            </div>
                        )}
                    </div>
                </div>

                {/* ─── Employee Details Card ─── */}
                <div className="space-y-6">
                    <div className="glass-card rounded-2xl p-6 animate-slide-up opacity-0 delay-500">
                        <h2 className="font-display text-xl font-bold mb-5">Profile</h2>

                        {/* Avatar */}
                        <div className="flex flex-col items-center mb-6">
                            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-3 ring-2 ring-primary/20 ring-offset-2 ring-offset-background">
                                {user?.photoURL ? (
                                    <Image src={user.photoURL} alt="Avatar" width={96} height={96} className="w-full h-full rounded-full object-cover" />
                                ) : (
                                    <User className="w-10 h-10 text-primary" />
                                )}
                            </div>
                            <p className="font-display text-xl font-bold">{user?.displayName || 'User'}</p>
                        </div>

                        {/* Details */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30">
                                <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                                <div className="min-w-0">
                                    <p className="text-xs text-muted-foreground">Email</p>
                                    <p className="text-sm font-medium truncate">{user?.email || '—'}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Model Status */}
                    <div className="glass-card rounded-2xl p-6 animate-slide-up opacity-0 delay-600">
                        <h2 className="font-display text-base font-bold mb-4">AI Model Status</h2>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Model</span>
                                <span className="text-sm font-medium">DenseNet121</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">TTA</span>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success font-medium">Enabled</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Format</span>
                                <span className="text-sm font-medium">ONNX</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Status</span>
                                <div className="flex items-center gap-1.5">
                                    <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                                    <span className="text-sm font-medium text-success">Online</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
