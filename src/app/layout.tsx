import type { Metadata } from "next"
import { Geist, Geist_Mono, Noto_Sans } from "next/font/google"
import "./globals.css"

import { AppShell } from "src/shared/components/layout/app-shell"
import { Providers } from "src/shared/components/providers"

const notoSans = Noto_Sans({ variable: "--font-sans" })

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
})

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
})

export const metadata: Metadata = {
	title: "ระบบบริหารจัดการองค์กร - YEC Lamphun",
}

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode
}>) {
	return (
		<html lang="th" className={notoSans.variable}>
			<body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
				<Providers>
					<AppShell>{children}</AppShell>
				</Providers>
			</body>
		</html>
	)
}
