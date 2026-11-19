const eligibilityItems = [
  "Open to all public and private secondary schools in Ogun State",
  "STEM Contest: SS1 and SS2 students only (up to 3 students per school team)",
  " It is compulsory to have at least one female student on the team, except for single-gender schools. ",
  "Innovation Pitch: Any student with a problem worth solving",
  "Schools must have a supervising teacher registered with the team",
  "Registration is free — no entry fees for any category",
  "Registration deadline: May 31st 2026. No exceptions.",
];

const steps = [
  {
    num: "1",
    title: "Complete the Online Form",
    desc: "Fill in your school details, student names, and supervising teacher information via our registration form. Takes under 10 minutes.",
  },
  {
    num: "2",
    title: "Receive Confirmation",
    desc: "You'll receive an email confirmation after application review at close of registration with the full competition guidelines.",
  },
  {
    num: "3",
    title: "Prepare for Zonals",
    desc: "The zonal stage runs June – July. Your supervising teacher will be sent the schedule at least 2 weeks in advance.",
  },
  {
    num: "4",
    title: "Compete at the Grand Finale",
    desc: "Qualifying schools advance to the October Grand Finale. Feeding and accommodation for students are covered by the programme.",
  },
];

/** Who can enter and what happens next. The button that opens the form belongs to the page. */
export default function RegistrationGuide() {
  return (
    <section className="bg-[#0A0F1E] px-6 pb-16 md:px-12 md:pb-24">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 md:gap-16 lg:grid-cols-2">
        <div className="bg-[#1C2540] p-8 md:p-10">
          <h2 className="mb-6 font-bebas text-2xl text-white md:text-3xl">Eligibility &amp; Requirements</h2>
          <ul className="space-y-4">
            {eligibilityItems.map((item) => (
              <li key={item} className="flex gap-4 text-sm text-[rgba(250,247,240,0.65)] md:text-base">
                <span className="shrink-0 font-bold text-primary">✦</span>
                <span>{item.trim()}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="mb-10 font-bebas text-2xl text-white md:text-3xl">How to Register</h2>
          <div className="space-y-6">
            {steps.map((step) => (
              <div key={step.num} className="flex gap-6">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#E8A020]">
                  <span className="font-bebas text-lg text-foreground">{step.num}</span>
                </div>
                <div>
                  <h3 className="mb-2 text-lg font-medium text-white md:text-xl">{step.title}</h3>
                  <p className="text-sm text-[rgba(250,247,240,0.65)] md:text-base">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
