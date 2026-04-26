import { SignUp } from "@clerk/nextjs"
import { Shield, FileCheck, Lock } from "lucide-react"

const clerkAppearance = {
  variables: {
    colorPrimary: "#0F172A",
    colorTextOnPrimaryBackground: "#ffffff",
    colorBackground: "#ffffff",
    colorText: "#0f172a",
    colorTextSecondary: "#475569",
    colorInputBackground: "#ffffff",
    colorInputText: "#0f172a",
    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full",
    card: "shadow-none border-0 bg-transparent p-0 w-full",
    headerTitle: "text-2xl font-semibold tracking-tight text-[#0F172A]",
    headerSubtitle: "text-sm text-slate-600",
    formFieldLabel: "text-slate-700 font-medium text-sm",
    formFieldInput:
      "h-11 rounded-md border-slate-300 bg-white text-slate-900 shadow-sm focus:border-[#3B82F6] focus:ring-2 focus:ring-[#3B82F6]/20",
    formButtonPrimary:
      "h-11 rounded-md bg-[#0F172A] hover:bg-[#1e293b] text-white font-medium shadow-sm normal-case text-sm",
    socialButtonsBlockButton:
      "h-11 rounded-md border-slate-300 hover:bg-slate-50",
    footerActionText: "text-slate-600 text-sm",
    footerActionLink: "text-[#3B82F6] hover:text-[#2563eb] font-medium",
    dividerLine: "bg-slate-200",
    dividerText: "text-slate-500 text-xs",
    footer: "hidden",
  },
} as const

const trustCues = [
  {
    icon: Shield,
    title: "Outside the CUI boundary",
    body: "Metadata-only by design — no Controlled Unclassified Information stored, processed, or transmitted.",
  },
  {
    icon: FileCheck,
    title: "Evidence ledger, not artifact store",
    body: "Tracks RunId, path, and SHA-256 hashes. Artifacts stay in your enclave.",
  },
  {
    icon: Lock,
    title: "CMMC Level 2 aligned",
    body: "110 NIST SP 800-171 Rev 2 controls, POA&M workflow, attestation engine, assessor mode.",
  },
]

export default function Page() {
  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-[#0F172A] relative overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] bg-[size:48px_48px]" />
        <div className="relative z-10 flex flex-col justify-between px-12 xl:px-16 py-16 w-full">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#3B82F6] mb-3">
              MacTech Solutions
            </p>
            <h1 className="text-4xl xl:text-5xl font-bold tracking-tight text-white leading-tight">
              Compliance Control Plane
            </h1>
            <p className="mt-4 text-lg text-slate-400 leading-relaxed max-w-md">
              The CMMC Level 2 operating system for defense contractors handling Controlled Unclassified Information.
            </p>
          </div>

          <div className="space-y-5">
            {trustCues.map((cue) => {
              const Icon = cue.icon
              return (
                <div key={cue.title} className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-slate-300" aria-hidden />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{cue.title}</p>
                    <p className="text-sm text-slate-400 mt-0.5 leading-relaxed">{cue.body}</p>
                  </div>
                </div>
              )
            })}
          </div>

          <p className="text-xs text-slate-500">
            mactechsolutionsllc.com · SDVOSB pending
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-white">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 -mx-4 sm:-mx-6 -mt-2 px-4 sm:px-6 pt-6 pb-8 rounded-b-xl bg-[#0F172A]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#3B82F6] mb-2">
              MacTech Solutions
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Compliance Control Plane
            </h1>
          </div>
          <SignUp appearance={clerkAppearance} signInUrl="/sign-in" />
        </div>
      </div>
    </div>
  )
}
