import { PageHead } from "@/pages/Menu";
import ServicesHours from "@/components/site/ServicesHours";
import { BUSINESS } from "@/lib/api";

export default function Contact() {
  return (
    <main data-testid="contact-page">
      <PageHead eyebrow="Contact" title="Say hello to Nas&Neq.">
        Call us, message us on Facebook, or drop by the café. Hours are shown as supplied (9AM–12AM).
      </PageHead>
      <ServicesHours />
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10 py-16">
        <h2 className="font-display text-3xl mb-6">Map</h2>
        <div className="rounded-3xl overflow-hidden border border-[var(--beige)] aspect-[4/3] sm:aspect-[16/7]">
          <iframe
            title="Map search for 66 Libyan St., Culiat, Quezon City"
            src={`https://www.google.com/maps?q=${encodeURIComponent(BUSINESS.address)}&output=embed`}
            className="w-full h-full"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            data-testid="contact-map"
          />
        </div>
        <p className="mt-3 text-xs text-[var(--taupe)]">Map shows a search for the supplied address; the pin location has not been verified by Nas&Neq.</p>
      </section>
    </main>
  );
}
