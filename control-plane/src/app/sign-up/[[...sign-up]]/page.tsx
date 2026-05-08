import { SignUp } from "@clerk/nextjs"
import { Shield, FileCheck, Lock } from "lucide-react"
import { MacTechFooter } from "@/components/MacTechFooter"

const ACCENT = "#3B82F6"
const ACCENT_HOVER = "#2563eb"
const ACCENT_ACTIVE = "#1d4ed8"
const FOOTER_LINK_HOVER = "#60a5fa"

const clerkAppearance = {
  variables: {
    colorPrimary: ACCENT,
    colorTextOnPrimaryBackground: "#ffffff",
    colorBackground: "#121212",
    colorText: "#f3f4f6",
    colorTextSecondary: "#9ca3af",
    colorInputBackground: "#0A0A0A",
    colorInputText: "#f3f4f6",
    colorNeutral: "#ffffff",
    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full bg-[#141414] border border-[#2A2A2A] rounded-xl shadow-lg shadow-black/40 p-7",
    card: "shadow-none border-0 bg-transparent p-0 w-full",
    header: "hidden",
    headerTitle: "hidden",
    headerSubtitle: "hidden",
    socialButtonsBlockButton: `h-12 rounded-lg border border-[#3A3A3A] bg-[#0A0A0A] hover:bg-[#141414] hover:border-[${ACCENT}] text-gray-100 font-medium normal-case text-sm transition-colors`,
    socialButtonsBlockButtonText: "text-gray-100 font-medium text-sm",
    socialButtonsBlockButtonArrow: "hidden",
    socialButtonsProviderIcon: "h-5 w-5",
    dividerRow: "my-5",
    dividerLine: "bg-[#2A2A2A]",
    dividerText: "text-gray-500 text-[11px] uppercase tracking-[0.18em] font-medium px-3",
    formFieldLabel: "text-gray-300 font-medium text-sm mb-1.5",
    formFieldInput: `h-12 rounded-lg border border-[#3A3A3A] bg-[#0A0A0A] text-gray-100 placeholder:text-gray-500 hover:border-[#4A4A4A] focus:border-[${ACCENT}] focus:ring-2 focus:ring-[${ACCENT}]/30 transition-colors`,
    formButtonPrimary: `h-12 rounded-lg bg-[${ACCENT}] hover:bg-[${ACCENT_HOVER}] active:bg-[${ACCENT_ACTIVE}] text-white font-semibold normal-case text-sm shadow-sm transition-colors`,
    footerActionText: "text-gray-400 text-sm",
    footerActionLink: `text-[${ACCENT}] hover:text-[${FOOTER_LINK_HOVER}] font-semibold`,
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
    <div className="min-h-screen flex flex-col bg-[#0A0A0A] text-gray-100">
      <div className="flex-1 flex">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#020414] via-[#050a24] to-[#0a1238] relative overflow-hidden border-r border-[#162048]">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,.09)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,.09)_1px,transparent_1px)] bg-[size:48px_48px]" />
        <div className="absolute -top-32 -left-32 w-[420px] h-[420px] rounded-full bg-[#3B82F6]/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -right-32 w-[480px] h-[480px] rounded-full bg-[#3B82F6]/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col justify-between px-12 xl:px-16 py-16 w-full">
          <div>
            <img
              src="/mactech.png"
              alt="MacTech Solutions"
              className="h-12 xl:h-14 w-auto object-contain object-left mb-8 invert"
            />
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#3B82F6] mb-3">
              Compliance Control Plane
            </p>
            <h1 className="text-4xl xl:text-5xl font-bold tracking-tight text-white leading-tight">
              CMMC Level 2,
              <br />
              built for the boundary.
            </h1>
            <p className="mt-4 text-lg text-gray-400 leading-relaxed max-w-md">
              The CMMC Level 2 operating system for defense contractors handling Controlled Unclassified Information.
            </p>
          </div>

          <div className="space-y-5">
            {trustCues.map((cue) => {
              const Icon = cue.icon
              return (
                <div key={cue.title} className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[#3B82F6]/15 border border-[#3B82F6]/30 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-[#60a5fa]" aria-hidden />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{cue.title}</p>
                    <p className="text-sm text-gray-400 mt-0.5 leading-relaxed">{cue.body}</p>
                  </div>
                </div>
              )
            })}
          </div>

          <p className="text-xs text-gray-500">
            mactechsolutionsllc.com · Veteran-owned · SDVOSB-certified
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 -mx-4 sm:-mx-6 -mt-2 px-4 sm:px-6 pt-6 pb-8 rounded-b-xl bg-gradient-to-br from-[#020414] to-[#0a1238] border-b border-[#162048]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#3B82F6] mb-2">
              MacTech Solutions · Compliance Control Plane
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              CMMC Level 2, built for the boundary.
            </h1>
          </div>
          <div className="mb-7">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#3B82F6] mb-2">
              Create account
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Compliance Control Plane
            </h1>
            <p className="mt-2 text-sm text-gray-400 leading-relaxed">
              Continue with Google or use your email below.
            </p>
          </div>
          <SignUp appearance={clerkAppearance} signInUrl="/sign-in" />
        </div>
      </div>
      </div>
      <MacTechFooter />
    </div>
  )
}
