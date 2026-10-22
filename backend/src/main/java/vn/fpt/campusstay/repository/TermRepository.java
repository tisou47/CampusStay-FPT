package vn.fpt.campusstay.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import vn.fpt.campusstay.entity.TermEntity;

public interface TermRepository extends JpaRepository<TermEntity, Long> {

    boolean existsByCode(String code);

    List<TermEntity> findAllByOrderByStayStartDesc();
}
