export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="mt-32 border-t border-white/10 bg-background/50 py-16 px-4 backdrop-blur-sm">
      <div className="page-wrap">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          <div className="col-span-1 md:col-span-2 space-y-6">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-lg shadow-indigo-500/20">
                <svg className="size-5" viewBox="0 0 32 32" fill="none">
                  <path d="M4 24V10a2 2 0 012-2h20a2 2 0 012 2v14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M4 24h24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </div>
              <span className="text-xl font-bold tracking-tight">Form-E</span>
            </div>
            <p className="max-w-xs text-muted-foreground leading-relaxed">
              Empowering transportation researchers with smart, dynamic survey tools. Built for the future of mode choice modelling.
            </p>
          </div>

          <div className="space-y-6">
            <h4 className="text-sm font-bold uppercase tracking-widest text-foreground">Platform</h4>
            <ul className="space-y-4 text-sm font-medium text-muted-foreground">
              <li><a href="#" className="hover:text-indigo-500 transition-colors">Survey Builder</a></li>
              <li><a href="#" className="hover:text-indigo-500 transition-colors">Templates</a></li>
              <li><a href="#" className="hover:text-indigo-500 transition-colors">Analytics</a></li>
              <li><a href="#" className="hover:text-indigo-500 transition-colors">Export Tools</a></li>
            </ul>
          </div>

          <div className="space-y-6">
            <h4 className="text-sm font-bold uppercase tracking-widest text-foreground">Resources</h4>
            <ul className="space-y-4 text-sm font-medium text-muted-foreground">
              <li><a href="#" className="hover:text-indigo-500 transition-colors">Documentation</a></li>
              <li><a href="#" className="hover:text-indigo-500 transition-colors">Help Center</a></li>
              <li><a href="#" className="hover:text-indigo-500 transition-colors">API Reference</a></li>
              <li><a href="#" className="hover:text-indigo-500 transition-colors">Privacy Policy</a></li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-sm text-muted-foreground/60 font-medium">
            &copy; {year} Form-E. Accelerating transportation research.
          </p>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">
            <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
            System Operational
          </div>
        </div>
      </div>

      {/* Transportation background element */}
      <div className="pointer-events-none absolute bottom-0 left-0 w-full overflow-hidden opacity-[0.03]">
        <svg className="w-full h-24" preserveAspectRatio="none" viewBox="0 0 1200 120" fill="none">
          <path d="M0 100 Q 300 80 600 100 T 1200 100" stroke="currentColor" strokeWidth="4" />
          <path d="M0 110 Q 300 90 600 110 T 1200 110" stroke="currentColor" strokeWidth="2" strokeDasharray="10 10" />
        </svg>
      </div>
    </footer>
  )
}
