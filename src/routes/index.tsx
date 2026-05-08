import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, Ellipsis, FileBraces, FileType, FlagTriangleRight, Languages, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "#/components/ui/dialog";
import { Field, FieldLabel } from "#/components/ui/field";
import { Progress } from "#/components/ui/progress";
import {
	deletePoFile,
	downloadFile,
	exportPoFile,
	getAllTranslationPercentages,
	loadAllPoFiles,
	type PoFileStore,
	parsePo,
	savePoFile,
	exportBatchedJson,
} from "#/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "#/components/ui/dropdown-menu";

export const Route = createFileRoute("/")({
	component: Home,
});

type UploadedFile = {
	name: string;
	language: string;
	isSource: boolean;
};

type UploadState =
	| { status: "idle" }
	| { status: "review_conflicts"; conflicts: PoFileStore[]; newFiles: PoFileStore[] }
	| { status: "saving" };

function Home() {
	const [files, setFiles] = useState<UploadedFile[]>([]);
	const [calculationResult, setCalculationResult] = useState<ReturnType<
		typeof getAllTranslationPercentages
	> | null>(null);
	const [dragging, setDragging] = useState(false);
	const [openedDialog, setOpenedDialog] = useState<string | null>(null);
	const [uploadState, setUploadState] = useState<UploadState>({
		status: "idle",
	});

	const sourceChosen = files.some((f) => f.isSource);

	useEffect(() => {
		const load = async () => {
			const stores = await loadAllPoFiles();

			setCalculationResult(getAllTranslationPercentages(stores));

			setFiles(
				stores.map((s) => ({
					name: `${s.language}.po`,
					language: s.language,
					isSource: s.isSource,
				})),
			);
		};

		load();
	}, []);

	const recalculate = async () => {
		const stores = await loadAllPoFiles();
		setCalculationResult(getAllTranslationPercentages(stores));
	};

	const handleDownload = async (language: string) => {
		const content = await exportPoFile(language);
		if (content === null) {
			return;
		}
		downloadFile(`messages-${language}.po`, content);
	};


	const handleJsonDownload = async (language: string) => {
		const content = await exportBatchedJson(language, 50);
		if (content === null) {
			return;
		}
		downloadFile("batched-messages.json", JSON.stringify(content));
	};

	const handleRemove = async (language: string) => {
		await deletePoFile(language);

		setFiles((prev) => prev.filter((f) => f.language !== language));

		await recalculate();
	};

	const markAsSource = async (language: string) => {
		const stores = await loadAllPoFiles();

		for (const store of stores) {
			store.isSource = store.language === language;
			await savePoFile(store);
		}

		setFiles((prev) =>
			prev.map((f) => ({
				...f,
				isSource: f.language === language,
			})),
		);

		await recalculate();
	};

	const saveFiles = async (filesToSave: PoFileStore[]) => {
		for (const f of filesToSave) {
			await savePoFile(f);
		}

		setOpenedDialog(null);

		setFiles(prev => {
			const map = new Map(prev.map(f => [f.language, f]))

			for (const r of filesToSave) {
				map.set(r.language, {

					name: `${r.language}.po`,
					language: r.language,
					isSource: r.isSource,
				})
			}

			return Array.from(map.values())
		})

		await recalculate();
	};

	const handleUpload = async (fileList: FileList | null) => {
		if (!fileList) return;

		const newFiles: PoFileStore[] = [];
		const conflicts: PoFileStore[] = [];

		for (const file of Array.from(fileList)) {
			const text = await file.text();
			const poFileStore = parsePo(text);

			if (files.some((f) => f.language === poFileStore.language)) {
				conflicts.push(poFileStore);
			} else {
				newFiles.push(poFileStore);
			}
		}

		// If conflicts exist → go to state machine step
		if (conflicts.length > 0) {
			setUploadState({
				status: "review_conflicts",
				conflicts,
				newFiles,
			});
			return;
		}

		// otherwise just save directly
		await saveFiles(newFiles);
	};

	return (
		<div className="p-8 max-w-3xl mx-auto space-y-6">
			<Dialog
				open={uploadState.status === "review_conflicts"}
				onOpenChange={(open) => {
					if (!open) {
						setUploadState({ status: "idle" });
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Overwrite files?</DialogTitle>
						<DialogDescription>
							These languages already exist:{" "}
							{uploadState.status === "review_conflicts"
								? uploadState.conflicts.map((f) => f.language).join(", ")
								: ""}
						</DialogDescription>
					</DialogHeader>

					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setUploadState({ status: "idle" });
							}}
						>
							Cancel
						</Button>

						<Button
							onClick={async () => {
								if (uploadState.status !== "review_conflicts") return;

								const { conflicts, newFiles } = uploadState;

								setUploadState({ status: "saving" });

								await saveFiles([...newFiles, ...conflicts]);

								setUploadState({ status: "idle" });
							}}
						>
							Overwrite
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<h1 className="text-3xl font-bold">PO Translator</h1>

			<div className="">
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
        w-full p-6 rounded-xl border-2 border-dashed
        cursor-pointer transition
        ${dragging
							? "border-purple-500 bg-purple-500/10"
							: "border-accent bg-secondary/10 hover:bg-secondary/20"
						}
      `}
				>
					<input
						type="file"
						accept=".po"
						multiple
						onChange={(e) => handleUpload(e.target.files)}
						className="hidden"
					/>

					<span className="text-sm text-gray-600">
						{dragging ? "Drop files here" : "Browse files or drag & drop"}
					</span>
				</label>

				<p className="text-sm text-muted-foreground">
					Upload one or more .po files
				</p>
			</div>

			{files.length > 0 && (
				<div className="space-y-4">
					<h2 className="text-xl font-semibold">Uploaded files</h2>

					<div className="grid gap-y-2 grid-cols-1">
						{files.sort((a) => a.isSource ? 0 : 1).map((file, i) => {
							const calculationPercentage = Math.round(
								(calculationResult ?? []).find(
									(cr) => cr.language === file.language,
								)?.percentage ?? 0,
							);
							return (
								<div
									key={i}
									className={`bg-secondary/10 border-secondary pr-2 rounded-lg border flex justify-between items-center ${file.isSource ? "" : "hover:bg-primary/10 hover:border-primary duration-100"}`}
								>
									<Link disabled={file.isSource} params={{ language: file.language }} to="/translate/$language" className="flex flex-row justify-between w-full py-2 pl-4 items-center">
										<div className="flex flex-row gap-x-2 items-center">
											<p className="font-bold">{file.language.toUpperCase()}</p>
											{file.isSource && (
												<Badge className="text-background">source</Badge>
											)}
										</div>

										{!file.isSource && sourceChosen && (
											<div className="flex items-center text-xs gap-x-4 relative">
												<Progress
													className="w-64 h-6 rounded-sm"
													value={calculationPercentage}
													id="progress-translation"
												/>
												<p className="absolute left-2 text-white">{calculationPercentage}% translated</p>
											</div>

										)}
									</Link>

									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button className="ml-2 hover:bg-secondary" variant="ghost"><Ellipsis /></Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent>
											<DropdownMenuGroup>
												<Link params={{ language: file.language }} to="/translate/$language">
													<DropdownMenuItem className="cursor-pointer">
														<Languages className="w-4" />
														Translate
													</DropdownMenuItem>
												</Link>
												<DropdownMenuItem
													onClick={(e) => {
														e.preventDefault();
														e.stopPropagation();
														markAsSource(file.language);
													}}
												>
													<FlagTriangleRight />
													Mark as source
												</DropdownMenuItem>
											</DropdownMenuGroup>
											<DropdownMenuSub>
												<DropdownMenuSubTrigger>
													<Download />
													Download
												</DropdownMenuSubTrigger>
												<DropdownMenuPortal>
													<DropdownMenuSubContent>
														<DropdownMenuItem
															onClick={() => {
																handleJsonDownload(file.language);
															}}
														>
															<FileBraces />
															Download batched JSON
														</DropdownMenuItem>
														<DropdownMenuItem
															onClick={() => {
																handleDownload(file.language);
															}}
														>
															<FileType />
															Export PO
														</DropdownMenuItem>
													</DropdownMenuSubContent>
												</DropdownMenuPortal>
											</DropdownMenuSub>
											<DropdownMenuSeparator />
											<Dialog>
												<DropdownMenuGroup>
													<DialogTrigger asChild>
														<DropdownMenuItem variant="destructive"
															onSelect={(e) => e.preventDefault()}
														>
															<X /> Delete
														</DropdownMenuItem>
													</DialogTrigger>
												</DropdownMenuGroup>
												<DialogContent className="border-gray-300">
													<DialogHeader>
														<DialogTitle>Are you sure?</DialogTitle>
														<DialogDescription>
															If you did not download the file all translation
															progress will be lost!
														</DialogDescription>
													</DialogHeader>
													<DialogFooter>
														<DialogClose asChild>
															<Button variant="outline">Cancel</Button>
														</DialogClose>
														<Button onClick={() => handleRemove(file.language)}>
															Remove
														</Button>
													</DialogFooter>
												</DialogContent>
											</Dialog>
										</DropdownMenuContent>
									</DropdownMenu>
								</div>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
}
