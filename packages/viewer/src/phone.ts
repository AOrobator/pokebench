// The one phone breakpoint. Media queries cannot read a CSS variable, so JS
// owns the constant and mirrors it onto <html> as [data-phone]; style.css and
// every entry point key off the flag instead of repeating the width.
export const PHONE = "(max-width: 700px)";

export const syncPhoneFlag = (doc: Document): boolean => {
  const phone = doc.defaultView?.matchMedia(PHONE).matches === true;
  doc.documentElement.toggleAttribute("data-phone", phone);
  return phone;
};

export const watchPhoneFlag = (doc: Document): void => {
  syncPhoneFlag(doc);
  doc.defaultView?.addEventListener("resize", () => { syncPhoneFlag(doc); });
};
