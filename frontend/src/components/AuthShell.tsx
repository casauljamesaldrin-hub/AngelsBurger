import React from "react";
import { BurgerArt, BurgerLineArt } from "./BurgerArt";

// Mustard-yellow burger-themed page used by Login and Forgot Password.
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#dcab0f]">
      <main className="relative z-10 flex flex-1 items-center justify-center px-6 py-10">
        <div className="relative w-full max-w-[22rem]">
          {/* Big burger peeking out behind the top-left of the card */}
          <BurgerArt
            className="pointer-events-none absolute -left-24 -top-24 w-44 -rotate-[8deg] drop-shadow-md sm:-left-48 sm:-top-28 sm:w-72"
          />
          {/* Line-art burger behind the bottom-right of the card */}
          <BurgerLineArt className="pointer-events-none absolute -bottom-20 -right-16 w-32 rotate-[4deg] sm:-bottom-24 sm:-right-24 sm:w-44" />

          <div className="relative rounded-md bg-white px-7 pb-7 pt-6 shadow-xl">
            <div className="mb-6 text-center">
              <span className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-amber-100">
                <BurgerArt className="w-6" />
              </span>
              <p className="text-lg font-extrabold text-gray-900">Angels Burger</p>
              <p className="text-xs text-gray-400">Inventory Management System</p>
            </div>
            {children}
          </div>
        </div>
      </main>

      <footer className="relative z-10 pb-4 text-center text-xs text-yellow-950/70">
        © {new Date().getFullYear()} Angels Burger | Inventory System
      </footer>
    </div>
  );
}