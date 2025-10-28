<?php
// LISTOBA api.php — v15 (polling + controle de versão otimista + logging)

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-Client-Version');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

date_default_timezone_set('America/Sao_Paulo');

$filename = __DIR__ . '/listoba.json';
$logfile  = __DIR__ . '/api.log';

function write_log($file, $msg){
  @file_put_contents($file, '['.date('Y-m-d H:i:s').'] '.$_SERVER['REMOTE_ADDR'].' - '.$msg.PHP_EOL, FILE_APPEND);
}

function read_state($filename){
  if(!file_exists($filename)){
    $init = array(
      "version" => 0,
      "people" => array("Thiagão","Iuri","Bruninho","Brunão","Rafão","Tobias","Jones","Rogério"),
      "clients" => array("Interno","Apter","Eduzz","CPL","F5 Films"),
      "tasks" => array(),
      "nextWeekNotes" => ""
    );
    @file_put_contents($filename, json_encode($init, JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE), LOCK_EX);
    @chmod($filename, 0664);
    return $init;
  }
  $raw = @file_get_contents($filename);
  if($raw===false || trim($raw)===""){
    return array("version"=>0,"people"=>array(),"clients"=>array(),"tasks"=>array(),"nextWeekNotes"=>"");
  }
  $data = json_decode($raw, true);
  if(!is_array($data)){
    return array("version"=>0,"people"=>array(),"clients"=>array(),"tasks"=>array(),"nextWeekNotes"=>"");
  }
  if(!isset($data["version"])){
    $data["version"] = @filemtime($filename) ?: 0;
  }
  return $data;
}

function save_state($filename, $data){
  $ok = @file_put_contents($filename, json_encode($data, JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE), LOCK_EX);
  if($ok===false){ throw new Exception('Falha ao escrever JSON'); }
  @chmod($filename, 0664);
  return $ok;
}

try{
  $action = isset($_GET['action']) ? $_GET['action'] : 'read';

  if($action==='read'){
    $data = read_state($filename);
    $data['version'] = isset($data['version']) ? intval($data['version']) : 0;
    write_log($logfile, "OK read v=".$data['version']);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
  }

  if($action==='save'){
    $clientVersion = isset($_SERVER['HTTP_X_CLIENT_VERSION']) ? intval($_SERVER['HTTP_X_CLIENT_VERSION']) : -1;
    $current = read_state($filename);
    $currentVersion = isset($current['version']) ? intval($current['version']) : 0;

    if($clientVersion !== -1 && $clientVersion !== $currentVersion){
      write_log($logfile, "CONFLICT clientVersion=$clientVersion serverVersion=$currentVersion");
      http_response_code(409);
      header('Content-Type: application/json; charset=utf-8');
      echo json_encode($current, JSON_UNESCAPED_UNICODE);
      exit;
    }

    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if(!is_array($data)){ throw new Exception('Payload inválido'); }

    if(isset($data['tasks']) && is_array($data['tasks'])){
      foreach($data['tasks'] as &$t){
        if(!isset($t['status'])){
          $t['status'] = (isset($t['done']) && $t['done']) ? 'done' : 'todo';
        }
        unset($t['done']);
      }
      unset($t);
    }

    $data['version'] = time();

    save_state($filename, $data);
    write_log($logfile, "OK save v=".$data['version']);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array("status"=>"ok","version"=>$data['version']), JSON_UNESCAPED_UNICODE);
    exit;
  }

  http_response_code(400);
  write_log($logfile, "ERR action inválida: ".$action);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(array("error"=>"Ação inválida."), JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
  http_response_code(500);
  write_log($logfile, "ERR ".$e->getMessage());
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(array("error"=>$e->getMessage()), JSON_UNESCAPED_UNICODE);
}
