param([string]$Goal = "compile", [string]$Extra = "")
$java = "D:\JAVA\jdk-17\bin\java.exe"
$m2 = "D:\apache-maven-3.5.3\apache-maven-3.9.12"
$cp = "$m2\boot\plexus-classworlds-2.9.0.jar"
$proj = "C:\Users\WIN11\WorkBuddy\2026-08-03-13-46-59\pet-park\pet-park-server"
Set-Location $proj
$args2 = @("-Dmaven.home=$m2", "-Dmaven.multiModuleProjectDirectory=$proj", "-Dclassworlds.conf=$m2\bin\m2.conf", "-Dfile.encoding=UTF-8", "-classpath", $cp, "org.codehaus.plexus.classworlds.launcher.Launcher", "-B", "-Dfile.encoding=UTF-8")
if ($Extra -ne "") { $args2 += $Extra.Split(" ") }
$args2 += $Goal
& $java $args2 *> "$proj\mvn-out.txt"
Write-Output "exit=$LASTEXITCODE"
