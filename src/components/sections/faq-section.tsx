"use client";

import { useState } from "react";

const faqItems = [
  {
    q: "Is participation free for schools?",
    a: "Yes. Registration and participation in all ASC competition categories — the STEM Contest and Innovation Pitch — are completely free for schools and students. There are no hidden fees at any stage.",
  },
  {
    q: "Which students are eligible for the STEM Contest?",
    a: "The STEM Contest is open to SS1 and SS2 students only, in teams of up to three students per school. Each team must be accompanied by a registered supervising teacher. It is compulsory to have at least one female student on the team, except for single-gender schools.",
  },
  {
    q: "What happens if our school wins the zonal stage?",
    a: "Schools that qualify through the zonal stage advance to the Grand Finale on 19 November. Travel and accommodation for qualifying student teams and their supervising teacher are covered in full by the ASC programme.",
  },
  {
    q: "What schools can participate?",
    a: "ASC is open to all secondary schools across Ogun State. The programme is statewide and we actively encourage schools from all LGAs to register.",
  },
];

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="bg-white py-14 md:py-20 px-6 md:px-12">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 md:gap-16">
          <div>
            <div className="mb-12 md:mb-16">
              <div className="flex items-center gap-3 mb-6">
                <span className="block w-6 h-px bg-[#E8A020]" />
                <span className="text-xs font-bold tracking-[0.3em] uppercase text-primary">
                  FAQs
                </span>
              </div>
              <h2 className="font-bebas text-5xl md:text-6xl lg:text-7xl leading-[0.95] text-foreground">
                Questions Answered.
              </h2>
            </div>
            <p className="text-sm md:text-base leading-relaxed text-[#555870] mt-6">
              Can't find what you're looking for? Email us at{" "}
              <a
                href="mailto:adewaleconference@gmail.com"
                className="font-bold text-foreground underline underline-offset-2 hover:text-primary transition-colors"
              >
                adewaleconference@gmail.com
              </a>{" "}
              and we'll respond within 24 hours.
            </p>
          </div>

          <div className="lg:col-span-2 space-y-4">
            {faqItems.map((item, idx) => (
              <div
                key={idx}
                className="border border-[#E8EAF0] hover:border-[#E8A020] transition-colors duration-300"
              >
                <button
                  onClick={() => toggleFaq(idx)}
                  className="w-full flex items-center justify-between p-6 md:p-8 text-left hover:bg-[#FAF7F0] transition-colors duration-300"
                >
                  <span className="font-medium text-foreground text-base md:text-lg">
                    {item.q}
                  </span>
                  <span
                    className={`text-2xl text-primary transition-transform duration-300 flex-shrink-0 ml-4 ${
                      openIndex === idx ? "rotate-45" : ""
                    }`}
                  >
                    +
                  </span>
                </button>
                {openIndex === idx && (
                  <div className="px-6 md:px-8 pb-6 md:pb-8 text-sm md:text-base text-[#555870] leading-relaxed border-t border-[#E8EAF0]">
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
