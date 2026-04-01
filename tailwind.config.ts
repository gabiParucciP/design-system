/** @type {import('tailwindcss').Config} */

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: false, // or 'media' or 'class',
  theme: {
    extend: {
      colors: {
        primary: "#D9D9D9",
        secondary: "#A6A6A6",
        label: "#000000",
        title: "#565656",
      },
    },
  },
};
