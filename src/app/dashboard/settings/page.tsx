"use client";

import React from "react";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import ModeToggle from "@/app/components/themeToggle";
import {
  User,
  Mail,
  Shield,
  Calendar,
  Settings2,
  Info,
} from "lucide-react";

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="animate-slide-up">
        <h1 className="font-display text-3xl font-bold mb-2">Settings</h1>
        <p className="text-muted-foreground">Manage your account and preferences</p>
      </div>

      {/* ─── Account Info ─── */}
      <div className="glass-card rounded-2xl p-6 animate-slide-up opacity-0 delay-100">
        <h2 className="font-display text-lg font-bold mb-5 flex items-center gap-2">
          <User className="w-5 h-5 text-primary" />
          Account Information
        </h2>
        <div className="space-y-4">
          <div className="flex items-center gap-4 p-4 rounded-xl bg-secondary/30">
            <div className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
              {user?.photoURL ? (
                <Image src={user.photoURL} alt="Avatar" width={56} height={56} className="w-full h-full rounded-full object-cover" />
              ) : (
                <User className="w-6 h-6 text-primary" />
              )}
            </div>
            <div className="min-w-0">
              <p className="font-display text-lg font-bold">{user?.displayName || 'User'}</p>
              <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/20">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="text-sm font-medium truncate">{user?.email || '—'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/20">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Provider</p>
                <p className="text-sm font-medium">
                  {user?.providerData?.[0]?.providerId === 'google.com' ? 'Google' : 'Email/Password'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/20">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Account Created</p>
                <p className="text-sm font-medium">
                  {user?.metadata?.creationTime
                    ? new Date(user.metadata.creationTime).toLocaleDateString()
                    : '—'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/20">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Email Verified</p>
                <p className="text-sm font-medium">{user?.emailVerified ? 'Yes' : 'No'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Appearance ─── */}
      <div className="glass-card rounded-2xl p-6 animate-slide-up opacity-0 delay-200">
        <h2 className="font-display text-lg font-bold mb-5 flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-primary" />
          Appearance
        </h2>
        <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/30">
          <div>
            <p className="font-medium text-sm">Theme</p>
            <p className="text-xs text-muted-foreground">
              Switch between light and dark mode
            </p>
          </div>
          <ModeToggle />
        </div>
      </div>

      {/* ─── About ─── */}
      <div className="glass-card rounded-2xl p-6 animate-slide-up opacity-0 delay-300">
        <h2 className="font-display text-lg font-bold mb-5 flex items-center gap-2">
          <Info className="w-5 h-5 text-primary" />
          About
        </h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Application</span>
            <span className="font-medium">AImpact Diagnostics</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Version</span>
            <span className="font-mono font-medium">2.0.0</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">AI Model</span>
            <span className="font-medium">DenseNet121 (ONNX)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
