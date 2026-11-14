import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
  {
    ignores: ["edge-mem-main/**", ".next/**", "node_modules/**", "next-env.d.ts", "bin/**"],
  },
];

export default eslintConfig;
