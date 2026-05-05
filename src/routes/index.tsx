import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { loadAllPoFiles, deletePoFile, parsePo, savePoFile, getAllTranslationPercentages, exportPoFile, downloadFile } from '#/lib/utils'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useEffect } from 'react'
import { X } from 'lucide-react';
import { Field, FieldLabel } from '#/components/ui/field'
import { Progress } from '#/components/ui/progress'

export const Route = createFileRoute('/')({
	component: Home,
})

type UploadedFile = {
	name: string,
	language: string,
	isSource: boolean
}

function Home() {
	const [files, setFiles] = useState<UploadedFile[]>([])
	const [calculationResult, setCalculationResult] = useState<ReturnType<typeof getAllTranslationPercentages> | null>(null)

	useEffect(() => {
		const load = async () => {
			const stores = await loadAllPoFiles()

			setCalculationResult(getAllTranslationPercentages(stores))

			setFiles(
				stores.map(s => ({
					name: `${s.language}.po`,
					language: s.language,
					isSource: s.isSource,
				}))
			)
		}

		load()
	}, [])

	const recalculate = async () => {
		const stores = await loadAllPoFiles()
		setCalculationResult(getAllTranslationPercentages(stores))
	}

	const handleDownload = async (language: string) => {
		const content = await exportPoFile(language)
		if (content === null) { return }
		downloadFile("messages.po", content)
	}

	const handleRemove = async (language: string) => {
		await deletePoFile(language)

		setFiles(prev =>
			prev.filter(f => f.language !== language)
		)

		await recalculate()
	}

	const markAsSource = async (language: string) => {
		const stores = await loadAllPoFiles()

		for (const store of stores) {
			store.isSource = store.language === language
			await savePoFile(store)
		}

		setFiles(prev =>
			prev.map(f => ({
				...f,
				isSource: f.language === language,
			}))
		)

		await recalculate()
	}

	const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const fileList = e.target.files
		if (!fileList) return

		const results: UploadedFile[] = []

		for (const file of Array.from(fileList)) {
			const text = await file.text()
			const poFileStore = parsePo(text)

			await savePoFile(poFileStore)

			results.push({
				name: file.name,
				language: poFileStore.language,
				isSource: poFileStore.isSource,
			})
		}

		setFiles(prev => {
			const map = new Map(prev.map(f => [f.language, f]))

			for (const r of results) {
				map.set(r.language, r)
			}

			return Array.from(map.values())
		})

		await recalculate()

		e.target.value = ''
	}

	return (
		<div className="p-8 max-w-3xl mx-auto space-y-6">
			<h1 className="text-3xl font-bold">Upload .po files</h1>

			<div className="">
				<input
					type="file"
					accept=".po"
					multiple
					onChange={handleUpload}
					className="mb-4 border-2 border-accent border-dashed rounded-xl p-6 text-center"
					placeholder="YI"
				/>

				<p className="text-sm text-muted-foreground">
					Upload one or more .po files
				</p>
			</div>

			{files.length > 0 && (
				<div className="space-y-4">
					<h2 className="text-xl font-semibold">Uploaded files</h2>

					<div className="space-y-2">
						{files.map((file, i) => {
							const calculationPercentage = Math.round((calculationResult ?? []).find((cr) => cr.language === file.language)?.percentage ?? 0)
							return (
								<Link
									key={i}
									className={`pl-4 pr-2 py-2 rounded-lg border flex justify-between items-center ${file.isSource ? "" : "hover:border-primary duration-100"}`} to={'/translate/$language'}
									disabled={file.isSource}
									params={{ language: file.language }}
								>
									<div className="flex flex-row gap-x-2 items-center">
										<p className="font-bold">{file.language.toUpperCase()}</p>

										{file.isSource ? (
											<Badge className="text-background">source</Badge>
										) : (
											<Button className="text-xs px-2 py-1 cursor-pointer" variant="ghost" onClick={(e) => {
												e.preventDefault();
												e.stopPropagation();
												markAsSource(file.language)
											}}>Mark as source</Button>
										)}
									</div>

									<div className="flex flex-row gap-x-4 items-center">
										{!file.isSource && (
											<>
												<Button className="cursor-pointer text-background" onClick={(e) => {
													e.preventDefault();
													e.stopPropagation();
													handleDownload(file.language)
												}}>download</Button>
												<Field className="w-full max-w-sm">
													<FieldLabel htmlFor="progress-translation">
														<span>Translation percentage</span>
														<span className="ml-auto">{calculationPercentage}%</span>
													</FieldLabel>
													<Progress value={calculationPercentage} id="progress-translation" />
												</Field>
											</>
										)}
										<Button className="cursor-pointer" variant="ghost" onClick={(e) => {
											e.preventDefault();
											e.stopPropagation();
											handleRemove(file.language)
										}}><X /></Button>
									</div>
								</Link>
							)
						})}
					</div>
				</div>
			)}
		</div>
	)
}
