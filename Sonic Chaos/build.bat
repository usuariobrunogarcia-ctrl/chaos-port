@ECHO OFF

IF EXIST SCbuilt.sym DEL SCbuilt.sym
IF EXIST SonicC.o DEL SonicC.o
IF EXIST SCbuilt.sms DEL SCbuilt.sms

ECHO Assembling...
WLA\wla-z80.exe -vo SonicChaos.asm SonicC.o

IF %ERRORLEVEL% NEQ 0 GOTO Build_Failed
IF NOT EXIST SonicC.o GOTO Build_Failed

ECHO Linking...
WLA\wlalink.exe -rs Link.txt SCbuilt.sms
IF %ERRORLEVEL% NEQ 0 GOTO Link_Failed

ECHO Assembly complete.

REM Use fcomp to compare with original ROM
REM ECHO Comparing with original:
fcomp SCbuilt.sms "SonicChaos.sms" > compare.txt


GOTO end

:Build_Failed
ECHO Assembly failed.

:Link_Failed
ECHO Error while linking.

:end
PAUSE