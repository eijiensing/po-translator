import { createFileRoute, Link } from "@tanstack/react-router";
import clsx from "clsx";
import { AlertCircle, ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "#/components/ui/badge";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldLabel,
	FieldTitle,
} from "#/components/ui/field";
import { ScrollArea, ScrollBar } from "#/components/ui/scroll-area";
import { Switch } from "#/components/ui/switch";
import { Textarea } from "#/components/ui/textarea";
import { loadAllPoFiles, savePoFile } from "#/lib/utils";
import { compareMessages } from "#/lib/check-message";
import { Button } from "#/components/ui/button";

export const Route = createFileRoute("/translate/$language")({
	component: RouteComponent,
});

type Entry = {
	id: string;
	source: string;
	target: string;
};

function RouteComponent() {
	const { language } = Route.useParams();

	const [dragging, setDragging] = useState(false);
	const [entries, setEntries] = useState<Entry[]>([]);
	const [sessionIds, setSessionIds] = useState<string[]>([]);
	const [index, setIndex] = useState(0);
	const [showAll, setShowAll] = useState(false);
	const inputRef = useRef<HTMLTextAreaElement | null>(null);

	const [sourceStore, setSourceStore] = useState<any>(null);
	const [targetStore, setTargetStore] = useState<any>(null);

	useEffect(() => {
		inputRef.current?.focus();
	}, [index]);

	// LOAD
	useEffect(() => {
		const load = async () => {
			const stores = await loadAllPoFiles();

			const source = stores.find((s) => s.isSource);
			const target = stores.find((s) => s.language === language);

			if (!source || !target) return;

			setSourceStore(source);
			setTargetStore(target);

			// build full entry list
			const merged: Entry[] = Object.values(source.entries).map((e) => ({
				id: e.id,
				source: e.value || e.id,
				target: target.entries[e.id]?.value ?? "",
			}));

			setEntries(merged);

			// SESSION LIST (fixed at load time)
			const untranslatedIds = merged
				.filter((e) => {
					if (e.target.trim() === "") return true;

					return compareMessages(e.source, e.target).length > 0;
				})
				.map((e) => e.id);

			setSessionIds(untranslatedIds);
		};

		load();
	}, [language]);

	// derived view (NOT stored, NOT recalculated session)
	const visibleEntries = showAll
		? entries
		: entries.filter((e) => sessionIds.includes(e.id));

	const current = visibleEntries[index];

	// early exit if source language selected
	if (targetStore?.isSource) {
		return (
			<div className="p-8 text-center text-lg">
				This language is marked as source. Nothing to translate.
			</div>
		);
	}

	if (!current) {
		return <div className="p-8">
			<p>No untranslated messages</p>
			<Button onClick={() => setShowAll(true)}>Show all</Button>
		</div>
	}

	// SAVE + NEXT
	const handleSubmit = async (value: string) => {
		if (!value.trim()) return;

		const updatedTarget = {
			...targetStore,
			entries: {
				...targetStore.entries,
				[current.id]: {
					...targetStore.entries[current.id],
					value,
				},
			},
		};

		await savePoFile(updatedTarget);
		setTargetStore(updatedTarget);

		// update entries (only data, NOT session)
		const newEntries = entries.map((e) =>
			e.id === current.id ? { ...e, target: value } : e,
		);

		setEntries(newEntries);

		// find next untranslated in SESSION LIST
		const nextIndex = visibleEntries.findIndex((e, i) => {
			if (i <= index) return false;

			if (e.target.trim() === "") return true;

			return compareMessages(e.source, e.target).length > 0;
		});

		if (nextIndex !== -1) {
			setIndex(nextIndex);
		} else {
			setIndex(Math.min(index + 1, visibleEntries.length - 1));
		}
	};


	const handleUpload = async (fileList: FileList | null) => {
		if (!fileList) return;
		const file = fileList[0];
		if (!file) return;

		const fileText = await file.text();
		const json: { id: string; message: string }[] = JSON.parse(fileText);

		// build updated entries map
		const updatedEntries = { ...targetStore.entries };

		for (const { id, message } of json) {
			if (!message?.trim()) continue;

			// only fill empty ones (same rule as before)
			if (!updatedEntries[id]?.value?.trim()) {
				updatedEntries[id] = {
					...updatedEntries[id],
					value: message.replaceAll("\"", "\\\""),
				};
			}
		}

		const updatedTarget = {
			...targetStore,
			entries: updatedEntries,
		};

		// SAVE to disk
		await savePoFile(updatedTarget);

		// update state
		setTargetStore(updatedTarget);

		// update UI entries
		setEntries((prev) =>
			prev.map((e) => ({
				...e,
				target:
					e.target.trim() === ""
						? json.find((je) => je.id === e.id)?.message.replaceAll("\"", "\\\"") ?? e.target
						: e.target,
			}))
		);
	};

	const currentProblems = compareMessages(
		current.source,
		current.target,
	);

	return (
		<div className="flex flex-col h-screen">
			<div className="flex justify-between items-center border-b border-input px-4 py-2">
				<div className="flex flex-col gap-y-2 shrink">
					<Link
						className="flex flex-row gap-x-2 items-center w-fit p-2 bg-secondary/20 border border-secondary rounded-lg"
						to={"/"}
					>
						<ArrowLeft className="size-4" />
						home
					</Link>
					<h1 className="font-bold text-xl">
						Translating {sourceStore.language.toUpperCase()} to{" "}
						{targetStore.language.toUpperCase()}
					</h1>
				</div>

				<div className="flex flex-row gap-x-4">
					<label
						onDragOver={(e) => {
							e.preventDefault();
							setDragging(true);
						}}
						onDragLeave={() => setDragging(false)}
						onDrop={(e) => {
							e.preventDefault();
							setDragging(false);
							handleUpload(e.dataTransfer.files);
						}}
						className={`
								flex flex-col items-center justify-center
								w-full rounded-xl border-2 border-dashed
								cursor-pointer transition
								${dragging
								? "border-purple-500 bg-purple-500/10"
								: "border-accent bg-secondary/10 hover:bg-secondary/20"
							}
							`}
					>
						<input
							type="file"
							accept=".json"
							onChange={(e) => handleUpload(e.target.files)}
							className="hidden"
						/>

						<span className="text-sm text-gray-600">
							{dragging ? "Drop file here" : "Import from JSON"}
						</span>
					</label>

					<FieldLabel htmlFor="switch-show-all">
						<Field orientation="horizontal">
							<FieldContent>
								<FieldTitle>Hide</FieldTitle>
								<FieldDescription>
									Hide messages that were translated in a previous session.
								</FieldDescription>
							</FieldContent>
							<Switch
								onCheckedChange={(v) => setShowAll(!v)}
								checked={!showAll}
								id="switch-show-all"
							/>
						</Field>
					</FieldLabel>
				</div>
			</div>
			<div className="flex flex-row flex-1 min-h-0">
				<div className="w-64 border-r border-input overflow-y-auto">
					<ScrollArea>
						<ScrollBar orientation="vertical" />
						<div className="w-64 border-r overflow-y-auto">
							{visibleEntries.map((e, i) => {
								const isTranslated = e.target.trim() !== "";

								const problems = isTranslated
									? compareMessages(e.source, e.target)
									: [];

								const hasErrors = problems.length > 0;

								return (
									<div
										key={e.id}
										onClick={() => setIndex(i)}
										className={clsx(
											"p-2 cursor-pointer text-sm",

											// untranslated
											!isTranslated && "bg-red-200",

											// translated but invalid
											isTranslated && hasErrors && "bg-yellow-200",

											// translated and valid
											isTranslated && !hasErrors && "bg-lime-200",

											i === index && "border-l-4 border-primary",
										)}
									>
										<p className="truncate">
											{i + 1}. {e.id}
										</p>
									</div>
								);
							})}
						</div>
					</ScrollArea>
				</div>

				{/* MAIN */}
				<div className="flex-1 p-6 space-y-4 flex flex-col">
					<div className="flex justify-between items-center">
						<h1 className="text-lg font-semibold">
							Message {index + 1}/{visibleEntries.length}
						</h1>
						<Badge variant="outline">{current.id}</Badge>
					</div>

					<div className="space-y-2">
						<p className="text-sm text-muted-foreground">
							Source ({sourceStore.language})
						</p>
						<div className="rounded-lg border border-input p-3 bg-muted/50 text-sm">
							{current.source}
						</div>
					</div>

					<div className="space-y-2">
						<p className="text-sm text-muted-foreground">
							Translation ({targetStore.language})
						</p>
						<Textarea
							ref={inputRef}
							key={current.id}
							defaultValue={current.target}
							placeholder="Enter translation..."
							spellCheck={false}
							rows={4}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									handleSubmit((e.target as HTMLTextAreaElement).value);
								}
							}}
						/>
					</div>
					{currentProblems.length > 0 && (
						<div className="rounded-lg border border-yellow-500 bg-yellow-500/10 p-3 space-y-2 text-yellow-800">
							<div className="flex items-center gap-2">
								<AlertCircle className="size-4" />
								<p className="text-sm font-medium">
									Translation issues detected
								</p>
							</div>

							<ul className="space-y-1">
								{currentProblems.map((problem, idx) => (
									<li
										key={`${problem.type}-${idx}`}
										className="text-sm"
									>
										• {problem.message}
									</li>
								))}
							</ul>
						</div>
					)}
					<div className="flex flex-1" />
					<div className="flex justify-between items-center">
						<Button
							onClick={async () => {
								if (inputRef.current?.value !== "" || inputRef.current?.value !== undefined) {
									const value = inputRef.current?.value ?? "";
									if (!value.trim()) return;

									const updatedTarget = {
										...targetStore,
										entries: {
											...targetStore.entries,
											[current.id]: {
												...targetStore.entries[current.id],
												value,
											},
										},
									};

									await savePoFile(updatedTarget);
									setTargetStore(updatedTarget);

									// update entries (only data, NOT session)
									const newEntries = entries.map((e) =>
										e.id === current.id ? { ...e, target: value } : e,
									);

									setEntries(newEntries);
								}
								setIndex(prev => prev - 1 === -1 ? 0 : prev - 1);
							}}
						>
							<ArrowLeft />
							PREVIOUS
						</Button>
						<Button
							onClick={async () => {
								if (inputRef.current?.value !== "" || inputRef.current?.value !== undefined) {
									const value = inputRef.current?.value ?? "";
									if (!value.trim()) return;

									const updatedTarget = {
										...targetStore,
										entries: {
											...targetStore.entries,
											[current.id]: {
												...targetStore.entries[current.id],
												value,
											},
										},
									};

									await savePoFile(updatedTarget);
									setTargetStore(updatedTarget);

									// update entries (only data, NOT session)
									const newEntries = entries.map((e) =>
										e.id === current.id ? { ...e, target: value } : e,
									);

									setEntries(newEntries);
								}
								setIndex(prev => prev + 1 > visibleEntries.length ? prev : prev + 1);
							}}
						>
							NEXT
							<ArrowRight />
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
